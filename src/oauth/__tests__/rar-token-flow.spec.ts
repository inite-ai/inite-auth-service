import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthTokenIssuerService } from '../oauth-token-issuer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { fakeSettings } from '../../common/settings/settings.test-fixture';
import type { User } from '@prisma/client';

/**
 * RFC 9396 token-side round trip: the granted authorization_details must be
 * (a) emitted as an access-token claim, (b) persisted on the refresh token, and
 * (c) re-emitted after refresh-token rotation.
 */
describe('RAR — authorization_details in the token issuer', () => {
  const details = [{ type: 'inite_mcp_resource', actions: ['read'] }];
  const user = { id: 'u1', did: 'did:key:abc', email: 'a@b.com' } as unknown as User;

  let signed: Array<Record<string, unknown>>;
  let created: Array<Record<string, unknown>>;
  let issuer: OAuthTokenIssuerService;
  let prisma: {
    oAuthClient: { findUnique: jest.Mock };
    refreshToken: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
  };

  beforeEach(() => {
    signed = [];
    created = [];
    const jwt = {
      sign: (payload: Record<string, unknown>) => {
        signed.push(payload);
        return 'signed.jwt';
      },
    } as unknown as JwtService;
    const config = {
      get: (k: string, d?: string) =>
        k === 'REFRESH_TOKEN_HMAC_SECRET' ? 'test-secret' : d ?? '',
    } as unknown as ConfigService;
    prisma = {
      oAuthClient: { findUnique: jest.fn().mockResolvedValue({ companyId: null }) },
      refreshToken: {
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return data;
        }),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    issuer = new OAuthTokenIssuerService(
      prisma as unknown as PrismaService,
      jwt,
      config,
      fakeSettings({}),
    );
  });

  it('emits authorization_details as an access-token claim + persists it', async () => {
    await issuer.generateTokens({ user, clientId: 'c1', scope: 'openid', authorizationDetails: details });

    const accessClaims = signed[0]!;
    expect(accessClaims.authorization_details).toEqual(details);
    expect(created[0]!.authorizationDetails).toEqual(details);
  });

  it('omits the claim when no details are granted', async () => {
    await issuer.generateTokens({ user, clientId: 'c1', scope: 'openid' });
    expect(signed[0]!).not.toHaveProperty('authorization_details');
  });

  it('carries the grant forward across refresh rotation', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      clientId: 'c1',
      userId: 'u1',
      scope: 'openid',
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
      amr: [],
      authorizationDetails: details,
      user,
    });

    await issuer.refreshAccessToken('raw-refresh', 'c1');

    const accessClaims = signed[0]!;
    expect(accessClaims.authorization_details).toEqual(details);
    expect(created[0]!.authorizationDetails).toEqual(details);
  });
});
