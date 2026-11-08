import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import type { ExecutionContext } from '@nestjs/common';
import { StorefrontOrgsService } from '../storefront-orgs.service';
import { StorefrontOrgsGuard, tokenClientId } from '../storefront-orgs.guard';
import { StorefrontOrgsController } from '../storefront-orgs.controller';
import { OrgRefusal, parseOrgInput, type LaneCaller } from '../storefront-orgs';
import { isOrganizationActive, orgAllowsClient } from '../../oauth/customer-lane';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OAuthAuditService } from '../../audit/oauth-audit.service';

/**
 * Storefront orgs (issue #304, rules in storefront-orgs.ts): a lane client
 * keeps its tenants' orgs. One in-memory organizations table stands behind
 * the real service; the store enforces the unique slug and companyId the
 * way Postgres does.
 */

type Org = { id: string; companyId: string; slug: string; name: string; metadata: unknown };

function db(seed: Org[] = []) {
  const orgs: Org[] = seed.map((o) => ({ ...o }));
  const writes: string[] = [];
  const unique = (data: Partial<Org>, selfId?: string) => {
    for (const o of orgs) {
      if (o.id === selfId) continue;
      if (data.slug !== undefined && o.slug === data.slug) throw p2002();
      if (data.companyId !== undefined && o.companyId === data.companyId) throw p2002();
    }
  };
  const organization = {
    findUnique: jest.fn(
      async ({ where }: { where: Partial<Org> }) =>
        orgs.find((o) => (where.slug ? o.slug === where.slug : o.companyId === where.companyId)) ??
        null,
    ),
    findMany: jest.fn(async ({ where }: { where: { companyId: { startsWith: string } } }) =>
      orgs.filter((o) => o.companyId.startsWith(where.companyId.startsWith)),
    ),
    create: jest.fn(async ({ data }: { data: Omit<Org, 'id'> }) => {
      unique(data);
      const row = { id: `org-${orgs.length + 1}`, ...data };
      orgs.push(row);
      writes.push(`create ${row.slug}`);
      return row;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Org> }) => {
      unique(data, where.id);
      const row = orgs.find((o) => o.id === where.id)!;
      Object.assign(row, data);
      writes.push(`update ${row.slug}`);
      return row;
    }),
  };
  // Rule 5: nothing but organizations is ever touched; any other model throws.
  const forbidden = new Proxy(
    {},
    {
      get: () => {
        throw new Error('touched a table other than organizations');
      },
    },
  );
  const prisma: Record<string, unknown> = {
    organization,
    membership: forbidden,
    orgRole: forbidden,
    apiKey: forbidden,
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown): Promise<unknown> =>
    fn(prisma),
  );
  return { prisma: prisma as unknown as PrismaService, orgs, writes };
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

const SHOP: LaneCaller = { clientId: 'inite-shop', prefix: 'shop-' };
const FOOD: LaneCaller = { clientId: 'inite-food', prefix: 'food-' };
const audit = () => ({
  record: jest.fn(async (_e: { event: string; success: boolean }) => undefined),
});

function service(seed: Org[] = []) {
  const d = db(seed);
  const a = audit();
  return {
    ...d,
    audit: a,
    svc: new StorefrontOrgsService(d.prisma, a as unknown as OAuthAuditService),
  };
}

describe('storefront orgs: upsert', () => {
  it('creates the tenant org with a namespaced companyId and the client in the lane', async () => {
    const { svc, orgs } = service();
    const view = await svc.upsert(SHOP, 'shop-pizza', {
      name: 'Pizza',
      tenantId: 't1',
      active: true,
    });
    expect(view).toEqual({ slug: 'shop-pizza', name: 'Pizza', tenantId: 't1', active: true });
    expect(orgs[0]).toMatchObject({
      companyId: 'inite-shop:t1',
      metadata: {
        customerLane: { clients: ['inite-shop'], owner: 'inite-shop', tenantId: 't1' },
        status: 'active',
      },
    });
  });

  it('is idempotent: the same call twice leaves one org as it was', async () => {
    const { svc, orgs } = service();
    const input = { name: 'Pizza', tenantId: 't1', active: true };
    const first = await svc.upsert(SHOP, 'shop-pizza', input);
    const second = await svc.upsert(SHOP, 'shop-pizza', input);
    expect(second).toEqual(first);
    expect(orgs).toHaveLength(1);
  });

  it('renames, and keeps the org when the storefront slug changes', async () => {
    const { svc, orgs } = service();
    await svc.upsert(SHOP, 'shop-pizza', { name: 'Pizza', tenantId: 't1', active: true });
    const moved = await svc.upsert(SHOP, 'shop-pizza-roma', {
      name: 'Pizza Roma',
      tenantId: 't1',
      active: true,
    });
    expect(moved).toMatchObject({ slug: 'shop-pizza-roma', name: 'Pizza Roma' });
    expect(orgs).toHaveLength(1);
    expect(orgs[0]!.companyId).toBe('inite-shop:t1');
  });

  it('active: false closes the org to customer sign-in, true reopens it', async () => {
    const { svc, orgs } = service();
    await svc.upsert(SHOP, 'shop-pizza', { name: 'Pizza', tenantId: 't1', active: false });
    expect(isOrganizationActive(orgs[0]!)).toBe(false);
    expect((await svc.list(SHOP))[0]!.active).toBe(false);
    await svc.upsert(SHOP, 'shop-pizza', { name: 'Pizza', tenantId: 't1', active: true });
    expect(isOrganizationActive(orgs[0]!)).toBe(true);
  });

  it("the org it writes is one the lane admits the caller's customers to, and no other client's", async () => {
    const { svc, orgs } = service();
    await svc.upsert(SHOP, 'shop-pizza', { name: 'Pizza', tenantId: 't1', active: true });
    const row = { ...orgs[0]!, metadata: orgs[0]!.metadata };
    expect(
      orgAllowsClient(row, { clientId: 'inite-shop', companyId: null, customerLane: true }),
    ).toBe(true);
    expect(
      orgAllowsClient(row, { clientId: 'inite-food', companyId: null, customerLane: true }),
    ).toBe(false);
  });

  it('keeps metadata keys it does not own', async () => {
    const { svc, orgs } = service();
    await svc.upsert(SHOP, 'shop-pizza', { name: 'Pizza', tenantId: 't1', active: true });
    (orgs[0]!.metadata as Record<string, unknown>).plan = 'pro';
    await svc.upsert(SHOP, 'shop-pizza', { name: 'Pizza', tenantId: 't1', active: true });
    expect(orgs[0]!.metadata).toMatchObject({ plan: 'pro', status: 'active' });
  });

  it('never touches memberships, roles or API keys', async () => {
    const { svc } = service();
    await expect(
      svc.upsert(SHOP, 'shop-pizza', { name: 'Pizza', tenantId: 't1', active: true }),
    ).resolves.toBeDefined();
  });

  it('audits every write and every refusal', async () => {
    const { svc, audit: a } = service([
      { id: 'x', companyId: 'co_real', slug: 'shop-taken', name: 'Real', metadata: null },
    ]);
    await svc.upsert(SHOP, 'shop-pizza', { name: 'Pizza', tenantId: 't1', active: true });
    await expect(
      svc.upsert(SHOP, 'shop-taken', { name: 'X', tenantId: 't2', active: true }),
    ).rejects.toThrow(OrgRefusal);
    expect(a.record.mock.calls.map(([e]) => [e.event, e.success])).toEqual([
      ['customer_lane.org_upsert', true],
      ['customer_lane.org_upsert', false],
    ]);
  });
});

describe('storefront orgs: slugs and ownership', () => {
  const refusal = (p: Promise<unknown>) => p.catch((e: OrgRefusal) => [e.status, e.code]);

  it("refuses a slug outside the caller's prefix, the bare prefix, or a malformed one", async () => {
    const { svc, writes } = service();
    const input = { name: 'X', tenantId: 't1', active: true };
    expect(await refusal(svc.upsert(SHOP, 'food-pizza', input))).toEqual([400, 'invalid_slug']);
    expect(await refusal(svc.upsert(SHOP, 'pizza', input))).toEqual([400, 'invalid_slug']);
    expect(await refusal(svc.upsert(SHOP, 'shop-', input))).toEqual([400, 'invalid_slug']);
    expect(await refusal(svc.upsert(SHOP, 'shop-Pizza Place', input))).toEqual([
      400,
      'invalid_slug',
    ]);
    expect(writes).toEqual([]);
  });

  it("a slug that is not the caller's org is 409 slug_taken, and nothing is written", async () => {
    const { svc, writes } = service([
      {
        id: 'x',
        companyId: 'co_real',
        slug: 'shop-real',
        name: 'A real company',
        metadata: { plan: 'pro' },
      },
      {
        id: 'y',
        companyId: 'inite-food:t9',
        slug: 'shop-food-squat',
        name: 'Food',
        metadata: { customerLane: { owner: 'inite-food', clients: ['inite-food'] } },
      },
    ]);
    const input = { name: 'X', tenantId: 't1', active: true };
    expect(await refusal(svc.upsert(SHOP, 'shop-real', input))).toEqual([409, 'slug_taken']);
    expect(await refusal(svc.upsert(SHOP, 'shop-food-squat', input))).toEqual([409, 'slug_taken']);
    expect(writes).toEqual([]);
  });

  it("another tenant's slug of the same client is 409 too: a stale org is never handed over", async () => {
    const { svc } = service();
    await svc.upsert(SHOP, 'shop-pizza', { name: 'Pizza', tenantId: 't1', active: true });
    expect(
      await refusal(
        svc.upsert(SHOP, 'shop-pizza', { name: 'Other', tenantId: 't2', active: true }),
      ),
    ).toEqual([409, 'slug_taken']);
  });

  it('a race on the unique slug comes back as 409, not 500', async () => {
    const { svc, prisma } = service();
    (
      prisma as unknown as { organization: { create: jest.Mock } }
    ).organization.create.mockRejectedValueOnce(p2002());
    expect(
      await refusal(
        svc.upsert(SHOP, 'shop-pizza', { name: 'Pizza', tenantId: 't1', active: true }),
      ),
    ).toEqual([409, 'slug_taken']);
  });
});

describe('storefront orgs: list', () => {
  it("returns the caller's own orgs only", async () => {
    const { svc } = service([
      { id: 'x', companyId: 'co_real', slug: 'real', name: 'Real', metadata: null },
    ]);
    await svc.upsert(SHOP, 'shop-pizza', { name: 'Pizza', tenantId: 't1', active: true });
    await svc.upsert(FOOD, 'food-sushi', { name: 'Sushi', tenantId: 't1', active: true });
    expect(await svc.list(SHOP)).toEqual([
      { slug: 'shop-pizza', name: 'Pizza', tenantId: 't1', active: true },
    ]);
    expect((await svc.list(FOOD)).map((o) => o.slug)).toEqual(['food-sushi']);
  });
});

describe('storefront orgs: the body', () => {
  it('needs a name and a tenantId; active defaults to true', () => {
    expect(parseOrgInput({ name: ' Pizza ', tenantId: 'clx_1-2' })).toEqual({
      name: 'Pizza',
      tenantId: 'clx_1-2',
      active: true,
    });
    expect(() => parseOrgInput({ tenantId: 't1' })).toThrow(OrgRefusal);
    expect(() => parseOrgInput({ name: 'P', tenantId: 'a b' })).toThrow(OrgRefusal);
    expect(() => parseOrgInput({ name: 'P', tenantId: 't1', active: 'yes' })).toThrow(OrgRefusal);
    expect(() => parseOrgInput([])).toThrow(OrgRefusal);
  });
});

describe('storefront orgs: who may call (StorefrontOrgsGuard)', () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const bearer = (claims: object) => `Bearer ${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;

  function ctx(user: unknown, claims: object = { client_id: 'inite-shop' }) {
    const req: Record<string, unknown> = { user, headers: { authorization: bearer(claims) } };
    return {
      req,
      context: { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext,
    };
  }

  function guard(client: unknown) {
    const prisma = { oAuthClient: { findUnique: jest.fn(async () => client) } };
    jest.spyOn(JwtAuthGuard.prototype, 'canActivate').mockResolvedValue(true as never);
    return new StorefrontOrgsGuard(prisma as unknown as PrismaService);
  }

  const LANE = {
    clientId: 'inite-shop',
    active: true,
    customerLane: true,
    customerLanePrefix: 'shop-',
  };
  const machine = (scope: string[]) => ({ kind: 'machine', scope: new Set(scope) });

  afterEach(() => jest.restoreAllMocks());

  it('lets a lane client with the scope in, as itself and its prefix', async () => {
    const { req, context } = ctx(machine(['customer-lane:orgs']));
    await expect(guard(LANE).canActivate(context)).resolves.toBe(true);
    expect(req.laneCaller).toEqual({ clientId: 'inite-shop', prefix: 'shop-' });
  });

  it('refuses a person token, even one carrying the scope', async () => {
    const { context } = ctx({ kind: 'user', scope: new Set(['customer-lane:orgs']) });
    await expect(guard(LANE).canActivate(context)).rejects.toMatchObject({
      response: { error: 'insufficient_scope' },
    });
  });

  it('refuses a machine token without the scope, admin included', async () => {
    const { context } = ctx(machine(['admin']));
    await expect(guard(LANE).canActivate(context)).rejects.toMatchObject({
      response: { error: 'insufficient_scope' },
    });
  });

  it('refuses a client that is not a lane client, has no prefix, is switched off or unknown', async () => {
    for (const client of [
      { ...LANE, customerLane: false },
      { ...LANE, customerLanePrefix: null },
      { ...LANE, active: false },
      null,
    ]) {
      const { context } = ctx(machine(['customer-lane:orgs']));
      await expect(guard(client).canActivate(context)).rejects.toMatchObject({
        response: { error: 'unauthorized_client' },
      });
    }
  });

  it("reads the token's client_id, not its audience", () => {
    expect(tokenClientId(bearer({ client_id: 'inite-shop', aud: 'inite-food' }))).toBe(
      'inite-shop',
    );
    expect(tokenClientId(bearer({ aud: 'inite-shop' }))).toBeNull();
    expect(tokenClientId(undefined)).toBeNull();
    expect(tokenClientId('Bearer not-a-jwt')).toBeNull();
  });
});

describe('storefront orgs: the controller answers in the shape the kit reads', () => {
  it('409 carries code slug_taken', async () => {
    const svc = {
      upsert: jest.fn(async () => {
        throw new OrgRefusal(409, 'slug_taken', 'taken');
      }),
    };
    const c = new StorefrontOrgsController(svc as unknown as StorefrontOrgsService);
    const err = await c
      .upsert({ laneCaller: SHOP } as never, 'shop-pizza', { name: 'P', tenantId: 't1' })
      .catch((e: { getStatus(): number; getResponse(): unknown }) => e);
    expect((err as { getStatus(): number }).getStatus()).toBe(409);
    expect((err as { getResponse(): unknown }).getResponse()).toMatchObject({
      error: 'slug_taken',
      code: 'slug_taken',
    });
  });

  it('a bad body is 400 before the service is called', async () => {
    const svc = { upsert: jest.fn() };
    const c = new StorefrontOrgsController(svc as unknown as StorefrontOrgsService);
    const err = await c
      .upsert({ laneCaller: SHOP } as never, 'shop-pizza', {})
      .catch((e: { getStatus(): number }) => e);
    expect((err as { getStatus(): number }).getStatus()).toBe(400);
    expect(svc.upsert).not.toHaveBeenCalled();
  });

  it('lowers the slug from the path', async () => {
    const svc = { upsert: jest.fn(async () => ({})) };
    const c = new StorefrontOrgsController(svc as unknown as StorefrontOrgsService);
    await c.upsert({ laneCaller: SHOP } as never, ' Shop-Pizza ', { name: 'P', tenantId: 't1' });
    expect(svc.upsert).toHaveBeenCalledWith(SHOP, 'shop-pizza', {
      name: 'P',
      tenantId: 't1',
      active: true,
    });
  });
});
