import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthClient } from '@prisma/client';
import { Request } from 'express';
import { DemoGrantService } from '../demo-grant.service';
import { DEMO_SUBJECT_TOKEN_TYPE, DEMO_TOKEN_TTL_SECONDS, demoScopes } from '../demo-grant';
import { TOKEN_EXCHANGE_GRANT } from '../token-support';
import { TokenController } from '../token.controller';
import { TokenGrantService } from '../token-grant.service';
import { ClientAuthService } from '../client-auth.service';
import { OAuthClientRegistryService } from '../oauth-client-registry.service';
import { OAuthAuditService } from '../../audit/oauth-audit.service';
import { MetricsService } from '../../common/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { fakeSettings } from '../../common/settings/settings.test-fixture';
import {
  DEMO_ORG_COMPANY_ID,
  DEMO_ORG_ID,
  DEMO_ORG_SLUG,
  DEMO_PERSONAS,
} from '../../organizations/demo-tenant';
import { TokenRequestBody } from '../dto/oauth-requests';

/**
 * The demo grant (owner decision 29.10.2026): `demo:<persona>` → a read-only
 * two-hour token of that persona in «Atlântica Group (demo)», never refreshed,
 * only for a first-party confidential client, only behind DEMO_GRANT_ENABLED.
 * Each refusal is spec-exact and says nothing about which check refused it.
 */

const SIGNING_KEY = 'demo-grant-spec-dummy-signing-key';
const ISSUER = 'https://auth.example.test';

const demoOrg = {
  id: DEMO_ORG_ID,
  companyId: DEMO_ORG_COMPANY_ID,
  slug: DEMO_ORG_SLUG,
  name: 'Atlântica Group (demo)',
  metadata: { isDemo: true },
};

function personaRow(key: string, over: Record<string, unknown> = {}) {
  const p = DEMO_PERSONAS.find((x) => x.key === key)!;
  return {
    id: `user-${key}`,
    did: `did:inite:${key}`,
    email: p.email,
    emailVerified: false,
    name: p.name,
    avatarUrl: null,
    passwordHash: null,
    metadata: { isDemo: true, persona: key },
    memberships: [{ role: p.orgRole, status: 'active', organizationId: DEMO_ORG_ID, organization: demoOrg }],
    _count: { passkeys: 0, oauthIdentities: 0, wallets: 0 },
    ...over,
  };
}

const productClient = (over: Partial<OAuthClient> = {}) =>
  ({
    clientId: 'inite-estate',
    firstParty: true,
    isPublic: false,
    tokenEndpointAuthMethod: 'client_secret_post',
    allowedGrants: ['authorization_code', 'refresh_token'],
    allowedScopes: ['openid', 'profile', 'email', 'offline_access'],
    customClaims: null,
    active: true,
    ...over,
  }) as unknown as OAuthClient;

const ctx = { ip: '10.0.0.7', userAgent: 'jest' };

const demoBody = (subject: string, over: Partial<TokenRequestBody> = {}): TokenRequestBody => ({
  grant_type: TOKEN_EXCHANGE_GRANT,
  client_id: 'inite-estate',
  client_secret: 'dummy',
  subject_token_type: DEMO_SUBJECT_TOKEN_TYPE,
  subject_token: subject,
  ...over,
});

function setup(opts: { enabled?: boolean; rows?: Record<string, unknown> } = {}) {
  const jwt = new JwtService({ secret: SIGNING_KEY });
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const metrics = {
    tokensIssued: { inc: jest.fn() },
    tokenFailures: { inc: jest.fn() },
    tokenLatency: { startTimer: () => () => undefined },
  };
  const rows = opts.rows ?? Object.fromEntries(DEMO_PERSONAS.map((p) => [p.email, personaRow(p.key)]));
  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: { where: { email: string } }) => Promise.resolve(rows[where.email] ?? null)),
    },
  };
  const config = { get: (k: string, d?: string) => (k === 'JWT_ISSUER' ? ISSUER : d) } as unknown as ConfigService;
  const settings = fakeSettings({ DEMO_GRANT_ENABLED: opts.enabled === false ? undefined : 'true' });
  const service = new DemoGrantService(
    prisma as unknown as PrismaService,
    jwt,
    config,
    settings,
    audit as unknown as OAuthAuditService,
    metrics as unknown as MetricsService,
  );
  return { service, jwt, audit, prisma, metrics };
}

async function refusal(p: Promise<unknown>): Promise<unknown> {
  const e = await p.then(
    () => {
      throw new Error('expected a refusal');
    },
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(BadRequestException);
  return (e as BadRequestException).getResponse();
}

describe('demo grant: a read-only 2 h token of a demo persona', () => {
  it.each(DEMO_PERSONAS.map((p) => [p.key, p.orgRole] as const))(
    'demo:%s gets the claims of a sign-in in the demo org, role %s',
    async (key, orgRole) => {
      const { service, jwt, audit } = setup();
      const res = await service.issue({ body: demoBody(`demo:${key}`), client: productClient(), ctx });
      const claims = jwt.verify<Record<string, unknown>>(res.access_token, { issuer: ISSUER, audience: 'inite-estate' });
      expect(claims).toMatchObject({
        sub: `did:inite:${key}`,
        client_id: 'inite-estate',
        userId: `user-${key}`,
        org: DEMO_ORG_COMPANY_ID,
        org_id: DEMO_ORG_ID,
        org_slug: DEMO_ORG_SLUG,
        org_role: orgRole,
        demo: true,
        roles: [orgRole],
        scope: 'openid profile estate:read',
      });
      expect(claims.platform_role).toBeUndefined();
      expect(res).toMatchObject({
        token_type: 'Bearer',
        issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        scope: 'openid profile estate:read',
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'token.issued.demo',
          success: true,
          clientId: 'inite-estate',
          sub: `did:inite:${key}`,
          audience: 'inite-estate',
          metadata: expect.objectContaining({ persona: key }),
        }),
      );
    },
  );

  it('lives exactly two hours', async () => {
    const { service, jwt } = setup();
    const res = await service.issue({ body: demoBody('demo:owner'), client: productClient(), ctx });
    const { iat, exp } = jwt.decode<{ iat: number; exp: number }>(res.access_token);
    expect(exp - iat).toBe(2 * 60 * 60);
    expect(res.expires_in).toBe(DEMO_TOKEN_TTL_SECONDS);
  });

  it('never returns a refresh token or an id_token, even when offline_access is asked for', async () => {
    const { service, jwt } = setup();
    const res = await service.issue({
      body: demoBody('demo:owner', { scope: 'openid offline_access email' }),
      client: productClient(),
      ctx,
    });
    expect(res).not.toHaveProperty('refresh_token');
    expect(res).not.toHaveProperty('id_token');
    expect(res.scope.split(' ')).not.toContain('offline_access');
    expect(jwt.decode<{ scope: string }>(res.access_token).scope).not.toContain('offline_access');
  });

  it('stays read-only when the client asks for write', async () => {
    const { service, jwt } = setup();
    const res = await service.issue({
      body: demoBody('demo:manager', { scope: 'estate:write estate:admin estate:read' }),
      client: productClient({ allowedScopes: ['openid', 'estate:read', 'estate:write'] } as Partial<OAuthClient>),
      ctx,
    });
    expect(res.scope).toBe('openid profile estate:read');
    expect(jwt.decode<{ scope: string }>(res.access_token).scope).toBe('openid profile estate:read');
  });

  it('derives <product>:read from the client id', () => {
    expect(demoScopes('inite-estate')).toEqual(['openid', 'profile', 'estate:read']);
    expect(demoScopes('inite-fund')).toEqual(['openid', 'profile', 'fund:read']);
    expect(demoScopes('smart-chat')).toEqual(['openid', 'profile', 'smart_chat:read']);
    expect(demoScopes('9bad')).toBeNull();
  });

  it('refuses everything with invalid_grant while DEMO_GRANT_ENABLED is off', async () => {
    const { service, prisma, audit } = setup({ enabled: false });
    expect(await refusal(service.issue({ body: demoBody('demo:owner'), client: productClient(), ctx }))).toEqual({
      error: 'invalid_grant',
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'token.failed.demo', success: false, errorMessage: 'disabled' }),
    );
  });

  it.each(['demo:admin', 'demo:', 'owner', 'did:inite:someone', 'demo:ana', ''])(
    'refuses subject %p with invalid_grant',
    async (subject) => {
      const { service, prisma } = setup();
      expect(await refusal(service.issue({ body: demoBody(subject), client: productClient(), ctx }))).toEqual({
        error: 'invalid_grant',
      });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    },
  );

  const notDemo: [string, Record<string, unknown> | null][] = [
    ['no such user', null],
    ['a user without the demo mark', { metadata: { persona: 'owner' } }],
    ['a user marked as another persona', { metadata: { isDemo: true, persona: 'staff' } }],
    ['a user with a password', { passwordHash: 'x' }],
    ['a user with a passkey', { _count: { passkeys: 1, oauthIdentities: 0, wallets: 0 } }],
    ['no membership in the demo org', { memberships: [] }],
    [
      'a demo org without isDemo',
      { memberships: [{ role: 'owner', organizationId: DEMO_ORG_ID, organization: { ...demoOrg, metadata: {} } }] },
    ],
    [
      'an isDemo org that is not the demo org',
      { memberships: [{ role: 'owner', organizationId: DEMO_ORG_ID, organization: { ...demoOrg, id: 'other' } }] },
    ],
  ];
  it.each(notDemo)('refuses %s with invalid_grant', async (_label, over) => {
    const owner = DEMO_PERSONAS[0]!;
    const rows = { [owner.email]: over === null ? undefined : personaRow('owner', over) };
    const { service, audit } = setup({ rows });
    expect(await refusal(service.issue({ body: demoBody('demo:owner'), client: productClient(), ctx }))).toEqual({
      error: 'invalid_grant',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'token.failed.demo', errorMessage: 'persona_not_demo' }),
    );
  });

  it.each([
    ['a third-party client', { firstParty: false }],
    ['a public client', { isPublic: true }],
    ['a client authenticating with none', { tokenEndpointAuthMethod: 'none' }],
    ['a dcr_ client, firstParty column or not', { clientId: 'dcr_abc123', firstParty: true }],
  ] as [string, Partial<OAuthClient>][])('refuses %s with unauthorized_client', async (_label, over) => {
    const { service, prisma } = setup();
    expect(await refusal(service.issue({ body: demoBody('demo:owner'), client: productClient(over), ctx }))).toEqual({
      error: 'unauthorized_client',
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('the token endpoint routes the demo grant past allowedGrants, and nothing else', () => {
  function controller(demo: DemoGrantService | undefined) {
    const registry = { validateGrantType: jest.fn() };
    const grants = { grantTokenExchange: jest.fn().mockResolvedValue({ access_token: 'exchanged' }) };
    const clientAuth = {
      authenticate: jest.fn().mockResolvedValue(productClient()),
      tokenAudiences: () => [],
    };
    const metrics = { tokenLatency: { startTimer: () => () => undefined }, tokenFailures: { inc: jest.fn() } };
    const c = new TokenController(
      registry as unknown as OAuthClientRegistryService,
      { record: jest.fn() } as unknown as OAuthAuditService,
      metrics as unknown as MetricsService,
      grants as unknown as TokenGrantService,
      clientAuth as unknown as ClientAuthService,
      demo,
    );
    return { c, registry, grants, clientAuth };
  }
  const req = { headers: { 'user-agent': 'jest' }, ip: '10.0.0.7' } as unknown as Request;

  it('authenticates the client, then hands the demo grant to DemoGrantService', async () => {
    const { service } = setup();
    const { c, registry, grants, clientAuth } = controller(service);
    const res = (await c.token(demoBody('demo:staff'), req)) as { scope: string };
    expect(res.scope).toBe('openid profile estate:read');
    expect(clientAuth.authenticate).toHaveBeenCalled();
    expect(registry.validateGrantType).not.toHaveBeenCalled();
    expect(grants.grantTokenExchange).not.toHaveBeenCalled();
  });

  it('keeps the agent exchange on its own path, allowedGrants checked', async () => {
    const { service } = setup();
    const { c, registry, grants } = controller(service);
    await c.token(
      { ...demoBody('x'), subject_token_type: 'urn:ietf:params:oauth:token-type:access_token' },
      req,
    );
    expect(registry.validateGrantType).toHaveBeenCalled();
    expect(grants.grantTokenExchange).toHaveBeenCalled();
  });

  it('refuses the demo grant when the service is not wired', async () => {
    const { c } = controller(undefined);
    expect(await refusal(c.token(demoBody('demo:owner'), req))).toEqual({ error: 'invalid_grant' });
  });
});
