import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { OAuthTokenIssuerService } from '../oauth-token-issuer.service';
import { orgClaims } from '../org-claims';
import { PrismaService } from '../../prisma/prisma.service';
import { fakeSettings } from '../../common/settings/settings.test-fixture';
import { DEMO_ORG_ID, DEMO_PERSONAS, isDemoOrganization, isDemoPersonaEmail } from '../../organizations/demo-tenant';

/**
 * The family tenant in the token: org_id is what every product keys its own
 * tenant row by, org_role is the person's role in that org (never a platform
 * role), org_slug names it, and demo marks the shared demo tenant.
 */
describe('tenant claims', () => {
  const user = { id: 'u1', did: 'did:key:zU1', email: 'a@b.test', metadata: null } as unknown as User;
  let signed: Array<Record<string, unknown>>;

  function issuer(memberships: unknown[]): OAuthTokenIssuerService {
    signed = [];
    const jwt = { sign: (p: Record<string, unknown>) => (signed.push(p), 'jwt') } as unknown as JwtService;
    const config = { get: (k: string, d?: string) => (k === 'REFRESH_TOKEN_HMAC_SECRET' ? 'test-secret' : (d ?? '')) } as unknown as ConfigService;
    const prisma = {
      oAuthClient: { findUnique: jest.fn().mockResolvedValue({ companyId: null }) },
      refreshToken: { create: jest.fn().mockImplementation(({ data }: { data: unknown }) => data) },
      membership: { findMany: jest.fn().mockResolvedValue(memberships) },
    };
    return new OAuthTokenIssuerService(prisma as unknown as PrismaService, jwt, config, fakeSettings({ RBAC_TOKEN_CLAIMS_ENABLED: 'true' }));
  }

  const acme = { organizationId: 'org-acme', role: 'admin', organization: { id: 'org-acme', companyId: 'co_acme', slug: 'acme', metadata: null } };

  it('stamps org_id, org, org_slug and org_role in the access and the ID token', async () => {
    await issuer([acme]).generateTokens({ user, clientId: 'inite-rent', scope: 'openid' });
    for (const claims of signed) {
      expect(claims).toMatchObject({ org: 'co_acme', org_id: 'org-acme', org_slug: 'acme', org_role: 'admin' });
      expect(claims.demo).toBeUndefined();
      expect(claims.platform_role).toBeUndefined();
    }
  });

  it('marks the demo tenant', async () => {
    const demo = { organizationId: DEMO_ORG_ID, role: 'owner', organization: { id: DEMO_ORG_ID, companyId: 'co_demo_atlantica', slug: 'demo', metadata: { isDemo: true } } };
    await issuer([demo]).generateTokens({ user, clientId: 'inite-rent', scope: 'openid' });
    expect(signed[0]).toMatchObject({ org_id: DEMO_ORG_ID, org_role: 'owner', demo: true });
  });

  it('carries no tenant claims for a person with no org', () => {
    expect(orgClaims({})).toEqual({});
  });

  it('demo personas are unreachable addresses, and the demo org is recognised by id or marker', () => {
    expect(DEMO_PERSONAS.every((p) => p.email.endsWith('.invalid'))).toBe(true);
    expect(isDemoPersonaEmail('ANA@demo.invalid')).toBe(true);
    expect(isDemoOrganization({ id: DEMO_ORG_ID })).toBe(true);
    expect(isDemoOrganization({ id: 'x', metadata: { isDemo: true } })).toBe(true);
    expect(isDemoOrganization({ id: 'x', metadata: { personal: true } })).toBe(false);
  });
});
