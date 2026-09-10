import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthTokenIssuerService } from '../oauth-token-issuer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { fakeSettings } from '../../common/settings/settings.test-fixture';
import { PersonalWorkspaceService } from '../personal-workspace.service';
import { personalWorkspaceCompanyId } from '../personal-workspace';
import type { User } from '@prisma/client';

/**
 * First-use workspace provisioning, at the seam that matters: what ends
 * up in the `org` claim.
 *
 * A user who arrives from an MCP client has no membership, so without
 * this the token carries no org, the resource server has no tenant, and
 * a correct OAuth flow dead-ends in a 401 the user cannot act on. The
 * tests below pin the three ways it must stay narrow: off by default,
 * only for a provisioning vertical, and never at the cost of the login.
 */
describe('personal workspace provisioning in the token issuer', () => {
  const user = { id: 'u1', did: 'did:inite:abc', email: 'a@b.com' } as unknown as User;
  const expectedCompanyId = personalWorkspaceCompanyId('u1');

  let signed: Array<Record<string, unknown>>;
  let prisma: {
    oAuthClient: { findUnique: jest.Mock };
    refreshToken: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
    membership: { findMany: jest.Mock; upsert: jest.Mock };
    organization: { upsert: jest.Mock };
  };

  function makeIssuer(flags: Record<string, string | undefined>): OAuthTokenIssuerService {
    signed = [];
    const jwt = {
      sign: (payload: Record<string, unknown>) => {
        signed.push(payload);
        return 'signed.jwt';
      },
    } as unknown as JwtService;
    const config = {
      get: (k: string, d?: string) =>
        k === 'REFRESH_TOKEN_HMAC_SECRET' ? 'test-secret' : (d ?? ''),
    } as unknown as ConfigService;
    prisma = {
      oAuthClient: { findUnique: jest.fn().mockResolvedValue({ companyId: null }) },
      refreshToken: {
        create: jest.fn().mockImplementation(({ data }: { data: unknown }) => data),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      // No membership: the state every brand-new user is in.
      membership: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
      organization: {
        upsert: jest.fn().mockResolvedValue({ id: 'org-1', companyId: expectedCompanyId }),
      },
    };
    const settings = fakeSettings(flags);
    return new OAuthTokenIssuerService(
      prisma as unknown as PrismaService,
      jwt,
      config,
      settings,
      undefined,
      new PersonalWorkspaceService(prisma as unknown as PrismaService, settings),
    );
  }

  const accessClaims = () => signed[0]!;

  it('gives a user with no organisation one, and stamps it as the tenant', async () => {
    const issuer = makeIssuer({
      RBAC_TOKEN_CLAIMS_ENABLED: 'true',
      PERSONAL_WORKSPACE_PROVISIONING_ENABLED: 'true',
    });

    await issuer.generateTokens({ user, clientId: 'dcr_x', scope: 'openid brain:read' });

    expect(accessClaims().org).toBe(expectedCompanyId);
    expect(accessClaims().org_id).toBe('org-1');
    expect(accessClaims().roles).toContain('owner');
    // Owner membership, not just an organisation row.
    expect(prisma.membership.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.membership.upsert.mock.calls[0]![0].create).toMatchObject({
      userId: 'u1',
      role: 'owner',
      status: 'active',
    });
  });

  it('stays off unless the operator turns it on', async () => {
    const issuer = makeIssuer({ RBAC_TOKEN_CLAIMS_ENABLED: 'true' });

    await issuer.generateTokens({ user, clientId: 'dcr_x', scope: 'openid brain:read' });

    expect(accessClaims().org).toBeUndefined();
    expect(prisma.organization.upsert).not.toHaveBeenCalled();
  });

  it('does not provision for another vertical asking for its own scopes', async () => {
    const issuer = makeIssuer({
      RBAC_TOKEN_CLAIMS_ENABLED: 'true',
      PERSONAL_WORKSPACE_PROVISIONING_ENABLED: 'true',
    });

    await issuer.generateTokens({ user, clientId: 'club_app', scope: 'openid profile email' });

    expect(accessClaims().org).toBeUndefined();
    expect(prisma.organization.upsert).not.toHaveBeenCalled();
  });

  it('never fails the login when the workspace cannot be created', async () => {
    const issuer = makeIssuer({
      RBAC_TOKEN_CLAIMS_ENABLED: 'true',
      PERSONAL_WORKSPACE_PROVISIONING_ENABLED: 'true',
    });
    prisma.organization.upsert.mockRejectedValue(new Error('database is down'));

    await expect(
      issuer.generateTokens({ user, clientId: 'dcr_x', scope: 'openid brain:read' }),
    ).resolves.toBeDefined();
    // Degrades to the pre-flag behaviour: a token with no org claim.
    expect(accessClaims().org).toBeUndefined();
  });

  it('leaves a user who already has a membership alone', async () => {
    const issuer = makeIssuer({
      RBAC_TOKEN_CLAIMS_ENABLED: 'true',
      PERSONAL_WORKSPACE_PROVISIONING_ENABLED: 'true',
    });
    prisma.membership.findMany.mockResolvedValue([
      {
        organizationId: 'org-real',
        role: 'member',
        organization: { companyId: 'acme' },
      },
    ]);

    await issuer.generateTokens({ user, clientId: 'dcr_x', scope: 'openid brain:read' });

    expect(accessClaims().org).toBe('acme');
    expect(prisma.organization.upsert).not.toHaveBeenCalled();
  });
});
