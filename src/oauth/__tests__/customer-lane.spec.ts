import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { CustomerLaneService } from '../customer-lane.service';
import {
  CUSTOMER_ROLE,
  isPasswordlessSession,
  laneVerdict,
  orgAllowsClient,
} from '../customer-lane';
import { OAuthService } from '../oauth.service';
import { OAuthTokenIssuerService } from '../oauth-token-issuer.service';
import { OAuthController } from '../oauth.controller';
import { OtpService } from '../../auth/otp/otp.service';
import { OtpController } from '../../auth/otp/otp.controller';
import { AuthController } from '../../auth/auth.controller';
import { LoginEmailThrottlerGuard } from '../../auth/guards/login-throttler.guard';
import { IpFloodGuard } from '../../auth/guards/ip-flood.guard';
import { SYSTEM_ROLE_PERMISSIONS } from '../../rbac/permissions';
import { fakeSettings } from '../../common/settings/settings.test-fixture';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * The customer lane (customer-lane.ts): a storefront's customers sign in
 * passwordless and become `customer` members of the storefront's org.
 *
 * One in-memory database stands behind the real services, so a test follows
 * a sign-in the way production does: the email code verifies (OtpService),
 * the code is created for the hinted org (OAuthService), the token is issued
 * for it (OAuthTokenIssuerService).
 */

type Row = Record<string, unknown>;

const BISTRO = {
  id: 'org-bistro',
  companyId: 'co_bistro',
  slug: 'bistro',
  name: 'Bistro',
  metadata: null as unknown,
};
const OTHER = {
  id: 'org-other',
  companyId: 'co_other',
  slug: 'other',
  name: 'Other',
  metadata: null as unknown,
};
const FOOD = {
  clientId: 'inite-food',
  companyId: 'co_bistro',
  customerLane: true,
  customClaims: null,
};

function db(opts: { orgs?: Row[]; clients?: Row[] } = {}) {
  const orgs: Row[] = opts.orgs ?? [{ ...BISTRO }, { ...OTHER }];
  const clients: Row[] = opts.clients ?? [{ ...FOOD }];
  const users: Row[] = [];
  const memberships: Row[] = [];
  const codes: Row[] = [];
  const refresh: Row[] = [];
  const byId = (id: unknown) => users.find((u) => u.id === id) ?? null;
  const prisma = {
    organization: {
      findUnique: jest.fn(
        async ({ where }: { where: { slug: string } }) =>
          orgs.find((o) => o.slug === where.slug) ?? null,
      ),
    },
    oAuthClient: {
      findUnique: jest.fn(
        async ({ where }: { where: { clientId: string } }) =>
          clients.find((c) => c.clientId === where.clientId) ?? null,
      ),
    },
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; email?: string } }) =>
        where.id ? byId(where.id) : (users.find((u) => u.email === where.email) ?? null),
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Row }) =>
        Object.assign(byId(where.id)!, data),
      ),
    },
    membership: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { userId_organizationId: { userId: string; organizationId: string } };
        }) => {
          const k = where.userId_organizationId;
          return (
            memberships.find(
              (m) => m.userId === k.userId && m.organizationId === k.organizationId,
            ) ?? null
          );
        },
      ),
      findMany: jest.fn(async ({ where }: { where: { userId: string } }) =>
        memberships
          .filter((m) => m.userId === where.userId && m.status === 'active')
          .map((m) => ({ ...m, organization: orgs.find((o) => o.id === m.organizationId) })),
      ),
      create: jest.fn(async ({ data }: { data: Row }) => {
        if (
          memberships.some(
            (m) => m.userId === data.userId && m.organizationId === data.organizationId,
          )
        ) {
          throw new Prisma.PrismaClientKnownRequestError('unique', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        memberships.push({ ...data });
        return data;
      }),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    authorizationCode: {
      create: jest.fn(async ({ data }: { data: Row }) => (codes.push(data), data)),
    },
    refreshToken: {
      create: jest.fn(async ({ data }: { data: Row }) => (refresh.push(data), data)),
    },
  };
  const identity = {
    createIdentity: jest.fn(async (email: string) => {
      const u = {
        id: `u${users.length + 1}`,
        did: `did:key:z${users.length + 1}`,
        email,
        name: null,
        emailVerified: false,
        metadata: {},
      };
      users.push(u);
      return u;
    }),
  };
  return { prisma, identity, users, memberships, codes, refresh };
}

type Db = ReturnType<typeof db>;
const LANE_ON = { CUSTOMER_LANE_ENABLED: 'true', RBAC_TOKEN_CLAIMS_ENABLED: 'true' };

function services(d: Db, env: Record<string, string> = LANE_ON) {
  const settings = fakeSettings(env);
  const prisma = d.prisma as unknown as PrismaService;
  const audit = { record: jest.fn(async () => undefined) };
  const lane = new CustomerLaneService(prisma, settings, audit as never);
  const signed: Row[] = [];
  const jwt = { sign: (p: Row) => (signed.push(p), 'jwt') } as unknown as JwtService;
  const config = {
    get: (k: string, dflt?: string) =>
      k === 'REFRESH_TOKEN_HMAC_SECRET' ? 'test-only-hmac-secret' : (dflt ?? ''),
  } as unknown as ConfigService;
  const issuer = new OAuthTokenIssuerService(prisma, jwt, config, settings);
  const oauth = new OAuthService(
    prisma,
    config,
    {} as never,
    d.identity as never,
    {} as never,
    issuer,
    { parse: () => undefined } as never,
    lane,
  );
  return { lane, issuer, oauth, signed, audit };
}

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    set: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    del: jest.fn(async (k: string) => void store.delete(k)),
    setIfAbsent: jest.fn(async (k: string, v: string) =>
      store.has(k) ? false : (store.set(k, v), true),
    ),
  };
}

/** Sign in by emailed code against the shared database; returns the user. */
async function signInByCode(d: Db, email: string) {
  let code = '';
  const mail = { sendOtpCode: jest.fn(async (_to: string, c: string) => ((code = c), true)) };
  const otp = new OtpService(
    d.prisma as never,
    fakeRedis() as never,
    mail as never,
    d.identity as never,
    { enabled: false } as never,
  );
  await otp.requestEmailLoginCode(email);
  return (await otp.verifyEmailLoginCode(email, code)).user;
}

function codeFor(
  oauth: OAuthService,
  input: {
    userId: string;
    amr: string[];
    organization?: string;
    clientId?: string;
    customer?: string;
  },
) {
  return oauth.createAuthorizationCode({
    clientId: input.clientId ?? 'inite-food',
    redirectUri: 'https://inite.food/callback',
    scope: 'openid',
    codeChallenge: 'challenge',
    userId: input.userId,
    amr: input.amr,
    organization: input.organization,
    customer: 'customer' in input ? input.customer : '1',
  });
}

describe('customer lane: a new customer', () => {
  it('signs in by email code and gets a customer membership in the hinted org', async () => {
    const d = db();
    const s = services(d);
    const user = await signInByCode(d, 'guest@example.test');

    await codeFor(s.oauth, { userId: user.id, amr: ['otp'], organization: 'bistro' });

    expect(d.memberships).toEqual([
      { userId: user.id, organizationId: 'org-bistro', role: CUSTOMER_ROLE, status: 'active' },
    ]);
    expect(d.codes[0]).toMatchObject({ companyId: 'co_bistro', amr: ['otp'] });
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'membership.customer.created', companyId: 'co_bistro' }),
    );
  });

  it('is issued a token for that org: org_role=customer, no platform_role, not in roles', async () => {
    const d = db();
    const s = services(d);
    const user = await signInByCode(d, 'guest@example.test');
    await codeFor(s.oauth, { userId: user.id, amr: ['otp'], organization: 'bistro' });

    await s.issuer.generateTokens({
      user: user as never,
      clientId: 'inite-food',
      scope: 'openid',
      tenant: d.codes[0]!.companyId as string,
    });

    expect(s.signed).toHaveLength(2);
    for (const claims of s.signed) {
      expect(claims).toMatchObject({
        org: 'co_bistro',
        org_id: 'org-bistro',
        org_slug: 'bistro',
        org_role: 'customer',
      });
      expect(claims.platform_role).toBeUndefined();
      expect(claims.roles).toEqual(['user']);
    }
    // Rotation keeps the org: the refresh token carries it.
    expect(d.refresh[0]!.companyId).toBe('co_bistro');
  });

  it('gets no password: the account holds only a verified address', async () => {
    const d = db();
    const s = services(d);
    const user = await signInByCode(d, 'guest@example.test');
    await codeFor(s.oauth, { userId: user.id, amr: ['otp'], organization: 'bistro' });

    expect(d.identity.createIdentity).toHaveBeenCalledWith('guest@example.test');
    expect(d.users[0]).toMatchObject({ emailVerified: true });
    expect(d.users[0]).not.toHaveProperty('passwordHash');
    for (const [arg] of d.prisma.user.update.mock.calls)
      expect(Object.keys(arg.data)).toEqual(['emailVerified']);
  });

  it('signs in by magic link the same way', async () => {
    const d = db();
    const s = services(d);
    const user = await d.identity.createIdentity('linked@example.test');
    user.emailVerified = true;

    await codeFor(s.oauth, { userId: user.id, amr: ['magic-link'], organization: 'bistro' });

    expect(d.memberships[0]).toMatchObject({ role: CUSTOMER_ROLE, organizationId: 'org-bistro' });
  });
});

describe('customer lane: people already in the org', () => {
  async function member(d: Db, role: string, status = 'active') {
    const user = await d.identity.createIdentity('known@example.test');
    user.emailVerified = true;
    d.memberships.push({ userId: user.id, organizationId: 'org-bistro', role, status });
    return user;
  }

  it('reuses an existing customer membership', async () => {
    const d = db();
    const s = services(d);
    const user = await member(d, CUSTOMER_ROLE);

    await codeFor(s.oauth, { userId: user.id, amr: ['otp'], organization: 'bistro' });

    expect(d.prisma.membership.create).not.toHaveBeenCalled();
    expect(d.memberships).toHaveLength(1);
    expect(s.audit.record).not.toHaveBeenCalled();
  });

  it('keeps a staff member staff, even after a password sign-in', async () => {
    const d = db();
    const s = services(d);
    const user = await member(d, 'admin');

    await codeFor(s.oauth, { userId: user.id, amr: ['pwd'], organization: 'bistro' });
    await s.issuer.generateTokens({
      user: user as never,
      clientId: 'inite-food',
      scope: 'openid',
      tenant: 'co_bistro',
    });

    expect(d.prisma.membership.create).not.toHaveBeenCalled();
    expect(d.prisma.membership.update).not.toHaveBeenCalled();
    expect(d.prisma.membership.upsert).not.toHaveBeenCalled();
    expect(d.memberships[0]!.role).toBe('admin');
    expect(s.signed[0]).toMatchObject({ org_role: 'admin' });
  });

  it('refuses a membership that is not active, and does not revive it', async () => {
    const d = db();
    const s = services(d);
    const user = await member(d, CUSTOMER_ROLE, 'suspended');

    await expect(
      codeFor(s.oauth, { userId: user.id, amr: ['otp'], organization: 'bistro' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(d.memberships[0]!.status).toBe('suspended');
    expect(d.codes).toHaveLength(0);
  });

  it('lets the row that won a concurrent insert stand, whatever its role', async () => {
    const d = db();
    const s = services(d);
    const user = await d.identity.createIdentity('race@example.test');
    user.emailVerified = true;
    // An admin adds the person between the lane's read and its insert.
    d.prisma.membership.findUnique.mockResolvedValueOnce(null);
    d.memberships.push({
      userId: user.id,
      organizationId: 'org-bistro',
      role: 'member',
      status: 'active',
    });

    await codeFor(s.oauth, { userId: user.id, amr: ['otp'], organization: 'bistro' });

    expect(d.memberships).toEqual([expect.objectContaining({ role: 'member' })]);
    expect(s.audit.record).not.toHaveBeenCalled();
  });
});

describe('customer lane: passwordless only', () => {
  it('refuses to make a customer of a password session', async () => {
    const d = db();
    const s = services(d);
    const user = await d.identity.createIdentity('pw@example.test');
    user.emailVerified = true;

    for (const amr of [['pwd'], ['pwd', 'otp'], ['hwk'], []]) {
      await expect(
        codeFor(s.oauth, { userId: user.id, amr, organization: 'bistro' }),
      ).rejects.toMatchObject({ status: 401 });
    }
    expect(d.memberships).toHaveLength(0);
    expect(d.codes).toHaveLength(0);
  });

  it('refuses an existing customer who signed in with a password', async () => {
    const d = db();
    const s = services(d);
    const user = await d.identity.createIdentity('pw@example.test');
    d.memberships.push({
      userId: user.id,
      organizationId: 'org-bistro',
      role: CUSTOMER_ROLE,
      status: 'active',
    });

    await expect(
      codeFor(s.oauth, { userId: user.id, amr: ['pwd'], organization: 'bistro' }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('never adds an unverified address', async () => {
    const d = db();
    const s = services(d);
    const user = await d.identity.createIdentity('unverified@example.test');

    await expect(
      codeFor(s.oauth, { userId: user.id, amr: ['otp'], organization: 'bistro' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(d.memberships).toHaveLength(0);
  });

  it('reads amr as passwordless only for a code or a link without a password', () => {
    expect(isPasswordlessSession(['otp'])).toBe(true);
    expect(isPasswordlessSession(['magic-link'])).toBe(true);
    expect(isPasswordlessSession(['pwd', 'otp'])).toBe(false);
    expect(isPasswordlessSession(['hwk'])).toBe(false);
    expect(laneVerdict(null, ['pwd'])).toBe('passwordless');
    expect(laneVerdict({ role: 'owner', status: 'active' }, ['pwd'])).toBe('staff');
  });
});

describe('customer lane: the org hint', () => {
  it('refuses an unknown org, a malformed slug and an inactive org', async () => {
    const d = db({
      orgs: [
        { ...BISTRO, metadata: { status: 'suspended' } },
        { ...OTHER, slug: 'closed', metadata: { active: false } },
      ],
    });
    const s = services(d);
    const user = await signInByCode(d, 'guest@example.test');

    for (const organization of ['nowhere', 'Not A Slug!', 'bistro', 'closed']) {
      await expect(
        codeFor(s.oauth, { userId: user.id, amr: ['otp'], organization }),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(d.memberships).toHaveLength(0);
  });

  it("refuses an org the client is not bound to: company A's storefront cannot mint B's customers", async () => {
    const d = db();
    const s = services(d);
    const user = await signInByCode(d, 'guest@example.test');

    await expect(
      codeFor(s.oauth, { userId: user.id, amr: ['otp'], organization: 'other' }),
    ).rejects.toMatchObject({
      response: { error: 'unauthorized_client' },
    });
    expect(d.memberships).toHaveLength(0);
  });

  it('accepts an org that names the client in metadata.customerLane.clients', async () => {
    const shop = {
      clientId: 'inite-shop',
      companyId: null,
      customerLane: true,
      customClaims: null,
    };
    const d = db({
      clients: [shop],
      orgs: [{ ...OTHER, metadata: { customerLane: { clients: ['inite-shop'] } } }],
    });
    const s = services(d);
    const user = await signInByCode(d, 'guest@example.test');

    await codeFor(s.oauth, {
      userId: user.id,
      amr: ['otp'],
      organization: 'other',
      clientId: 'inite-shop',
    });

    expect(d.memberships[0]).toMatchObject({ organizationId: 'org-other', role: CUSTOMER_ROLE });
    expect(d.codes[0]).toMatchObject({ companyId: 'co_other' });
    expect(
      orgAllowsClient({ ...OTHER, metadata: { customerLane: { clients: ['inite-food'] } } }, shop),
    ).toBe(false);
  });
});

describe('customer lane: off unless switched on for the client', () => {
  it('ignores the hint without the customer=1 marker: a staff login of the same product', async () => {
    const d = db();
    const s = services(d);
    const user = await signInByCode(d, 'merchant@example.test');

    await codeFor(s.oauth, {
      userId: user.id,
      amr: ['otp'],
      organization: 'bistro',
      customer: undefined,
    });

    expect(d.prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(d.memberships).toHaveLength(0);
  });

  it('ignores the hint for a client without the lane flag', async () => {
    const rent = {
      clientId: 'inite-rent',
      companyId: 'co_bistro',
      customerLane: false,
      customClaims: null,
    };
    const d = db({ clients: [rent] });
    const s = services(d);
    const user = await signInByCode(d, 'guest@example.test');

    await codeFor(s.oauth, {
      userId: user.id,
      amr: ['otp'],
      organization: 'other',
      clientId: 'inite-rent',
    });

    expect(d.prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(d.memberships).toHaveLength(0);
    expect(d.codes[0]).toMatchObject({ companyId: 'co_bistro' });
  });

  it('a non-lane client keeps choosing the org by its own companyId at /token', async () => {
    const rent = {
      clientId: 'inite-rent',
      companyId: 'co_bistro',
      customerLane: false,
      customClaims: null,
    };
    const d = db({ clients: [rent] });
    const s = services(d);
    const user = await d.identity.createIdentity('staff@example.test');
    d.memberships.push({
      userId: user.id,
      organizationId: 'org-other',
      role: 'member',
      status: 'active',
    });
    d.memberships.push({
      userId: user.id,
      organizationId: 'org-bistro',
      role: 'admin',
      status: 'active',
    });

    await s.issuer.generateTokens({
      user: user as never,
      clientId: 'inite-rent',
      scope: 'openid',
      tenant: 'co_other',
    });

    expect(s.signed[0]).toMatchObject({ org: 'co_bistro', org_role: 'admin' });
    expect(d.refresh[0]!.companyId).toBe('co_bistro');
  });

  it('ignores the hint entirely with CUSTOMER_LANE_ENABLED off', async () => {
    const d = db();
    const s = services(d, { RBAC_TOKEN_CLAIMS_ENABLED: 'true' });
    const user = await signInByCode(d, 'guest@example.test');

    await codeFor(s.oauth, { userId: user.id, amr: ['otp'], organization: 'other' });

    expect(d.prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(d.memberships).toHaveLength(0);
    expect(d.codes[0]).toMatchObject({ companyId: 'co_bistro' });
  });

  it('grants the customer role no permission at all', () => {
    expect(SYSTEM_ROLE_PERMISSIONS[CUSTOMER_ROLE]).toEqual([]);
  });
});

describe('customer lane: /authorize', () => {
  const FRONTEND = 'https://auth.inite.test';
  const previous = process.env.FRONTEND_URL;
  beforeAll(() => {
    process.env.FRONTEND_URL = FRONTEND;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previous;
  });

  function controller(d: Db) {
    const s = services(d);
    const createAuthorizationCode = jest
      .spyOn(s.oauth, 'createAuthorizationCode')
      .mockResolvedValue('code-1');
    const registry = {
      validateClient: jest.fn(async () => ({
        ...FOOD,
        allowedScopes: ['openid'],
        allowedAudiences: [],
        redirectUris: [],
      })),
      validateRedirectUri: () => true,
      validateGrantType: () => undefined,
    };
    const stepUp = { isSatisfied: () => true, achievedAcr: () => undefined };
    const consent = { isRequired: async () => false };
    const c = new OAuthController(
      s.oauth,
      registry as never,
      {} as never,
      stepUp as never,
      {} as never,
      consent as never,
    );
    return { c, createAuthorizationCode };
  }

  const query = {
    response_type: 'code',
    client_id: 'inite-food',
    redirect_uri: 'https://inite.food/callback',
    scope: 'openid',
    code_challenge: 'challenge',
    code_challenge_method: 'S256',
    organization: 'Bistro',
    customer: '1',
  };
  const res = () => ({ redirect: jest.fn() });
  const req = (session?: Row) =>
    ({ headers: { host: 'auth-api.inite.test' }, session }) as unknown as Request;

  it('sends a person with no session to a passwordless login screen, the org hint carried', async () => {
    const d = db();
    const { c } = controller(d);
    const r = res();
    await c.authorize(query, req(undefined), r as unknown as Response);
    const url = new URL(r.redirect.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('customer')).toBe('1');
    expect(url.searchParams.get('organization')).toBe('bistro');
  });

  it('sends a password session back to sign in passwordless instead of minting a code', async () => {
    const d = db();
    const { c, createAuthorizationCode } = controller(d);
    d.users.push({ id: 'u9', email: 'pw@example.test' });
    const r = res();
    await c.authorize(query, req({ userId: 'u9', amr: ['pwd'] }), r as unknown as Response);
    const url = new URL(r.redirect.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('step_up')).toBe('1');
    expect(url.searchParams.get('customer')).toBe('1');
    expect(createAuthorizationCode).not.toHaveBeenCalled();
  });

  it('answers prompt=none for a password session with login_required', async () => {
    const d = db();
    const { c, createAuthorizationCode } = controller(d);
    const r = res();
    await c.authorize(
      { ...query, prompt: 'none' },
      req({ userId: 'u9', amr: ['pwd'] }),
      r as unknown as Response,
    );
    expect(new URL(r.redirect.mock.calls[0][0] as string).searchParams.get('error')).toBe(
      'login_required',
    );
    expect(createAuthorizationCode).not.toHaveBeenCalled();
  });

  it('mints the code for the hinted org after a passwordless sign-in', async () => {
    const d = db();
    const { c, createAuthorizationCode } = controller(d);
    const r = res();
    await c.authorize(query, req({ userId: 'u9', amr: ['otp'] }), r as unknown as Response);
    expect(createAuthorizationCode).toHaveBeenCalledWith(
      expect.objectContaining({ organization: 'bistro', customer: '1', amr: ['otp'] }),
    );
  });

  it('refuses an unknown org before anyone signs in', async () => {
    const d = db();
    const { c } = controller(d);
    await expect(
      c.authorize(
        { ...query, organization: 'nowhere' },
        req(undefined),
        res() as unknown as Response,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('customer lane: sends are rate limited', () => {
  const guardsOf = (target: object, method: string) =>
    (Reflect.getMetadata('__guards__', (target as Record<string, unknown>)[method] as object) ??
      []) as unknown[];

  it('caps the email code and the sign-in link per address and per IP', () => {
    for (const guards of [
      guardsOf(OtpController.prototype, 'requestLogin'),
      guardsOf(AuthController.prototype, 'sendMagicLink'),
    ]) {
      expect(guards).toEqual(expect.arrayContaining([LoginEmailThrottlerGuard, IpFloodGuard]));
    }
  });

  it('refuses a second code to the same address inside the cooldown', async () => {
    const d = db();
    const mail = { sendOtpCode: jest.fn(async () => true) };
    const otp = new OtpService(
      d.prisma as never,
      fakeRedis() as never,
      mail as never,
      d.identity as never,
      { enabled: false } as never,
    );
    await otp.requestEmailLoginCode('guest@example.test');
    await expect(otp.requestEmailLoginCode('GUEST@example.test')).rejects.toMatchObject({
      status: 429,
    });
    expect(mail.sendOtpCode).toHaveBeenCalledTimes(1);
  });
});
