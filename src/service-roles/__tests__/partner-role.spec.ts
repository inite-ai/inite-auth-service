import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { PartnerRoleService } from '../partner-role.service';
import { PartnerRoleGuard } from '../partner-role.guard';
import { PartnerRoleController } from '../partner-role.controller';
import {
  PartnerRoleRefusal,
  parsePartnerRoleInput,
  rolesAfter,
  type PartnerRoleCaller,
} from '../partner-role';
import {
  permittedScopes,
  dcrSupportedScopes,
  supportedScopes,
} from '../../oauth/oauth-scopes.registry';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OAuthTokenIssuerService } from '../../oauth/oauth-token-issuer.service';
import { fakeSettings } from '../../common/settings/settings.test-fixture';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OAuthAuditService } from '../../audit/oauth-audit.service';

/**
 * The partner role door (rules in partner-role.ts): a product backend puts
 * `partner` and `partner:<code>` on an account and can touch no other role.
 * Before it, inite.ai needed the superadmin roles API, and a compromised
 * product would have owned every family account.
 */

type User = {
  id: string;
  did: string;
  email: string;
  emailVerified: boolean;
  metadata: unknown;
  updatedAt: Date;
};

function db(seed: Partial<User>[] = []) {
  const users: User[] = seed.map((u, i) => ({
    id: `u${i + 1}`,
    did: `did:key:u${i + 1}`,
    email: `user${i + 1}@example.com`,
    emailVerified: true,
    metadata: null,
    updatedAt: new Date(1000),
    ...u,
  }));
  const writes: string[] = [];
  const user = {
    findMany: jest.fn(
      async ({ where }: { where: { email: { equals: string }; emailVerified: boolean } }) =>
        users
          .filter(
            (u) =>
              u.email.toLowerCase() === where.email.equals.toLowerCase() &&
              u.emailVerified === where.emailVerified,
          )
          .slice(0, 2)
          .map((u) => ({ ...u })),
    ),
    updateMany: jest.fn(
      async ({ where, data }: { where: { id: string; updatedAt: Date }; data: Partial<User> }) => {
        const row = users.find((u) => u.id === where.id);
        if (!row || row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
        // Only metadata is ever written (rule 4).
        expect(Object.keys(data)).toEqual(['metadata']);
        Object.assign(row, data, { updatedAt: new Date(row.updatedAt.getTime() + 1) });
        writes.push(row.id);
        return { count: 1 };
      },
    ),
  };
  // Nothing but users is ever touched: no user is created, no membership or role row.
  const forbidden = new Proxy(
    {},
    {
      get: () => {
        throw new Error('touched a table other than users');
      },
    },
  );
  const prisma = { user, membership: forbidden, orgRole: forbidden, organization: forbidden };
  return { prisma: prisma as unknown as PrismaService, users, writes, user };
}

const INITE: PartnerRoleCaller = { clientId: 'inite-ai' };
const roles = (u: User) => (u.metadata as { roles?: string[] } | null)?.roles;

function service(seed: Partial<User>[] = []) {
  const d = db(seed);
  const audit = { record: jest.fn(async (_e: Record<string, unknown>) => undefined) };
  return {
    ...d,
    audit,
    svc: new PartnerRoleService(d.prisma, audit as unknown as OAuthAuditService),
  };
}

const grant = { email: 'ana@example.com', code: 'ana', action: 'grant' } as const;
const revoke = { ...grant, action: 'revoke' } as const;

describe('partner role door: grant', () => {
  it('adds partner and partner:<code> and keeps every other role, admin and superadmin included', async () => {
    const { svc, users } = service([
      {
        email: 'ana@example.com',
        metadata: { roles: ['user', 'admin', 'superadmin'], isAdmin: true, companyId: 'co_1' },
      },
    ]);
    const view = await svc.apply(INITE, grant);
    expect(view).toEqual({ userId: 'u1', roles: ['partner', 'partner:ana'], changed: true });
    expect(users[0]!.metadata).toEqual({
      roles: ['user', 'admin', 'superadmin', 'partner', 'partner:ana'],
      isAdmin: true,
      companyId: 'co_1',
    });
  });

  it('never makes anyone an admin: isAdmin and the admin roles are untouched on a plain account', async () => {
    const { svc, users } = service([{ email: 'ana@example.com', metadata: { roles: ['user'] } }]);
    await svc.apply(INITE, grant);
    expect(users[0]!.metadata).toEqual({ roles: ['user', 'partner', 'partner:ana'] });
  });

  it('an account with no stored roles keeps the "user" the issuer showed for it', async () => {
    const { svc, users } = service([{ email: 'ana@example.com' }]);
    await svc.apply(INITE, grant);
    expect(roles(users[0]!)).toEqual(['user', 'partner', 'partner:ana']);
  });

  it('keeps another partner code the account already holds', async () => {
    const { svc, users } = service([
      { email: 'ana@example.com', metadata: { roles: ['partner', 'partner:old'] } },
    ]);
    const view = await svc.apply(INITE, grant);
    expect(roles(users[0]!)).toEqual(['partner', 'partner:old', 'partner:ana']);
    expect(view.roles).toEqual(['partner', 'partner:old', 'partner:ana']);
  });

  it('is idempotent: a second grant writes nothing and says so', async () => {
    const { svc, writes } = service([{ email: 'ana@example.com', metadata: { roles: ['user'] } }]);
    await svc.apply(INITE, grant);
    const again = await svc.apply(INITE, grant);
    expect(again.changed).toBe(false);
    expect(writes).toEqual(['u1']);
  });

  it('finds the account by verified email, case-insensitive', async () => {
    const { svc, users } = service([{ email: 'Ana@Example.COM', metadata: { roles: ['user'] } }]);
    await svc.apply(INITE, { ...grant, email: 'ana@example.com' });
    expect(roles(users[0]!)).toContain('partner:ana');
  });

  it('an unknown or unverified email is 404 no-account, and no user is created', async () => {
    const { svc, writes } = service([{ email: 'ana@example.com', emailVerified: false }]);
    const err = await svc.apply(INITE, grant).catch((e: PartnerRoleRefusal) => e);
    expect(err).toBeInstanceOf(PartnerRoleRefusal);
    expect([(err as PartnerRoleRefusal).status, (err as PartnerRoleRefusal).code]).toEqual([
      404,
      'no-account',
    ]);
    expect(writes).toEqual([]);
  });

  it('two accounts differing only by case are 409, never a guess', async () => {
    const { svc, writes } = service([{ email: 'ana@example.com' }, { email: 'ANA@example.com' }]);
    await expect(svc.apply(INITE, grant)).rejects.toMatchObject({
      status: 409,
      code: 'ambiguous-account',
    });
    expect(writes).toEqual([]);
  });

  it('a write that raced this one is read again, not overwritten with stale metadata', async () => {
    const { svc, users, user } = service([
      { email: 'ana@example.com', metadata: { roles: ['user'] } },
    ]);
    user.findMany.mockImplementationOnce(async () => {
      const stale = { ...users[0]! };
      // An admin edit lands between the read and the write.
      users[0]!.metadata = { roles: ['user', 'admin'], isAdmin: true };
      users[0]!.updatedAt = new Date(5000);
      return [stale];
    });
    await svc.apply(INITE, grant);
    expect(users[0]!.metadata).toEqual({
      roles: ['user', 'admin', 'partner', 'partner:ana'],
      isAdmin: true,
    });
  });

  it('audits every call, with the account sub and no email', async () => {
    const { svc, audit } = service([{ email: 'ana@example.com' }]);
    await svc.apply(INITE, grant);
    await svc.apply(INITE, { ...grant, email: 'nobody@example.com' }).catch(() => undefined);
    const events = audit.record.mock.calls.map(([e]) => e);
    expect(events.map((e) => [e.event, e.success, e.errorMessage])).toEqual([
      ['service.user.partner_role', true, null],
      ['service.user.partner_role', false, 'no-account'],
    ]);
    expect(events[0]).toMatchObject({ clientId: 'inite-ai', sub: 'did:key:u1' });
    expect(JSON.stringify(events)).not.toContain('example.com');
  });
});

describe('partner role door: revoke', () => {
  it('removes partner:<code> and partner when no other code is left; other roles stay', async () => {
    const { svc, users } = service([
      {
        email: 'ana@example.com',
        metadata: { roles: ['user', 'admin', 'partner', 'partner:ana'], isAdmin: true },
      },
    ]);
    const view = await svc.apply(INITE, revoke);
    expect(view).toEqual({ userId: 'u1', roles: [], changed: true });
    expect(users[0]!.metadata).toEqual({ roles: ['user', 'admin'], isAdmin: true });
  });

  it('keeps partner while another partner code remains', async () => {
    const { svc, users } = service([
      { email: 'ana@example.com', metadata: { roles: ['partner', 'partner:ana', 'partner:old'] } },
    ]);
    await svc.apply(INITE, revoke);
    expect(roles(users[0]!)).toEqual(['partner', 'partner:old']);
  });

  it('a revoke of what is not there writes nothing', async () => {
    const { svc, writes } = service([{ email: 'ana@example.com', metadata: { roles: ['user'] } }]);
    expect((await svc.apply(INITE, revoke)).changed).toBe(false);
    expect(writes).toEqual([]);
  });
});

describe('partner role door: the body cannot name any other role', () => {
  it('takes an email, a code and grant|revoke; anything else is refused or ignored', () => {
    expect(
      parsePartnerRoleInput({ email: ' Ana@Example.com ', code: 'ana-1', action: 'grant' }),
    ).toEqual({
      email: 'ana@example.com',
      code: 'ana-1',
      action: 'grant',
    });
    const bad = [
      { email: 'ana@example.com', code: 'ana', action: 'set' },
      { email: 'ana@example.com', code: 'Admin', action: 'grant' },
      { email: 'ana@example.com', code: 'a', action: 'grant' },
      { email: 'ana@example.com', code: 'x'.repeat(33), action: 'grant' },
      { email: 'ana@example.com', code: 'ana:admin', action: 'grant' },
      { email: 'ana@example.com', code: '../x', action: 'grant' },
      { email: 'not-an-email', code: 'ana', action: 'grant' },
      [],
    ];
    for (const b of bad) expect(() => parsePartnerRoleInput(b)).toThrow(PartnerRoleRefusal);
  });

  it('a roles field in the body is ignored: only the two partner roles can be added', async () => {
    const { svc, users } = service([{ email: 'ana@example.com', metadata: { roles: ['user'] } }]);
    const input = parsePartnerRoleInput({
      email: 'ana@example.com',
      code: 'ana',
      action: 'grant',
      roles: ['superadmin'],
      metadata: { isAdmin: true },
    });
    await svc.apply(INITE, input);
    expect(users[0]!.metadata).toEqual({ roles: ['user', 'partner', 'partner:ana'] });
  });

  it('the grant only ever adds the two roles, whatever the account holds', () => {
    const before = ['viewer', 'owner', 'admin'];
    const after = rolesAfter(before, 'zz', 'grant');
    expect(after.filter((r) => !before.includes(r))).toEqual(['partner', 'partner:zz']);
  });
});

describe('partner role door: who may call (PartnerRoleGuard)', () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const bearer = (claims: object) => `Bearer ${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;

  function ctx(user: unknown, claims: object = { client_id: 'inite-ai' }) {
    const req: Record<string, unknown> = { user, headers: { authorization: bearer(claims) } };
    return {
      req,
      context: { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext,
    };
  }

  function guard(client: unknown) {
    const prisma = { oAuthClient: { findUnique: jest.fn(async () => client) } };
    jest.spyOn(JwtAuthGuard.prototype, 'canActivate').mockResolvedValue(true as never);
    return new PartnerRoleGuard(prisma as unknown as PrismaService);
  }

  const CLIENT = { clientId: 'inite-ai', active: true, allowedScopes: ['roles:partner'] };
  const machine = (scope: string[]) => ({ kind: 'machine', scope: new Set(scope) });

  afterEach(() => jest.restoreAllMocks());

  it('lets a client with the scope in, as itself', async () => {
    const { req, context } = ctx(machine(['roles:partner']));
    await expect(guard(CLIENT).canActivate(context)).resolves.toBe(true);
    expect(req.partnerCaller).toEqual({ clientId: 'inite-ai' });
  });

  it('refuses a machine token without roles:partner, even one with admin', async () => {
    const { context } = ctx(machine(['admin', 'audit:handoff']));
    await expect(guard(CLIENT).canActivate(context)).rejects.toMatchObject({
      response: { error: 'insufficient_scope' },
    });
  });

  it('refuses a person token, even a superadmin carrying the scope', async () => {
    const { context } = ctx({
      kind: 'user',
      scope: new Set(['roles:partner']),
      metadata: { roles: ['superadmin'] },
    });
    await expect(guard(CLIENT).canActivate(context)).rejects.toMatchObject({
      response: { error: 'insufficient_scope' },
    });
  });

  it('refuses a client switched off, or whose manifest no longer lists the scope', async () => {
    for (const client of [
      { ...CLIENT, active: false },
      { ...CLIENT, allowedScopes: ['audit:handoff'] },
      null,
    ]) {
      const { context } = ctx(machine(['roles:partner']));
      await expect(guard(client).canActivate(context)).rejects.toMatchObject({
        response: { error: 'unauthorized_client' },
      });
    }
  });
});

describe('partner role door: who may hold the scope', () => {
  it('only a client provisioned with it: never a dynamic registration or an API key', () => {
    expect(dcrSupportedScopes()).not.toContain('roles:partner');
    expect(supportedScopes()).not.toContain('roles:partner');
    expect(permittedScopes('dcr_abc', 'roles:partner')).toEqual([]);
    expect(
      permittedScopes(
        { clientId: 'inite-cli', isPublic: true, allowedScopes: [] },
        'roles:partner',
      ),
    ).toEqual([]);
    expect(
      permittedScopes({ clientId: 'inite-ai', allowedScopes: ['roles:partner'] }, 'roles:partner'),
    ).toEqual(['roles:partner']);
  });

  it('the controller is POST /v1/service/users/partner-role behind the guard', () => {
    expect(Reflect.getMetadata('path', PartnerRoleController)).toBe('service/users');
    expect(Reflect.getMetadata('path', PartnerRoleController.prototype.apply)).toBe('partner-role');
    expect(Reflect.getMetadata('__guards__', PartnerRoleController)).toEqual([PartnerRoleGuard]);
  });
});

describe('partner role door: the next token carries the roles (rule 6)', () => {
  it('the issuer stamps metadata.roles as the door left them on the next issue', async () => {
    const { svc, users } = service([
      { email: 'ana@example.com', metadata: { roles: ['user', 'admin'], isAdmin: true } },
    ]);
    await svc.apply(INITE, grant);

    const signed: Record<string, unknown>[] = [];
    const jwt = { sign: (p: Record<string, unknown>) => (signed.push(p), 'jwt') } as never;
    const config = {
      get: (k: string, dflt?: string) =>
        k === 'REFRESH_TOKEN_HMAC_SECRET' ? 'test-only-hmac-secret' : (dflt ?? ''),
    } as never;
    const prisma = {
      oAuthClient: { findUnique: jest.fn(async () => null) },
      refreshToken: { create: jest.fn(async () => ({})) },
    } as unknown as PrismaService;
    const issuer = new OAuthTokenIssuerService(prisma, jwt, config, fakeSettings({}));
    await issuer.generateTokens({
      user: users[0] as never,
      clientId: 'inite-ai',
      scope: 'openid',
    } as never);

    expect(signed[0]!.roles).toEqual(['user', 'admin', 'partner', 'partner:ana']);
  });
});
