import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthTokenIssuerService } from '../oauth-token-issuer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { fakeSettings } from '../../common/settings/settings.test-fixture';

/**
 * RFC 6749 §5.2: a refresh token that can no longer be used is answered
 * with 400 `invalid_grant`. MCP clients (Claude among them) read that code
 * as "the sign-in is gone — ask the person to connect again"; a 401 read
 * as a transient fault and the client retried a dead token.
 */
describe('a dead refresh token answers invalid_grant', () => {
  let prisma: { refreshToken: { findUnique: jest.Mock; updateMany: jest.Mock } };
  let issuer: OAuthTokenIssuerService;

  beforeEach(() => {
    prisma = {
      refreshToken: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const config = {
      get: (k: string, d?: string) =>
        k === 'REFRESH_TOKEN_HMAC_SECRET' ? 'test-secret' : (d ?? ''),
    } as unknown as ConfigService;
    issuer = new OAuthTokenIssuerService(
      prisma as unknown as PrismaService,
      { sign: () => 'signed.jwt' } as unknown as JwtService,
      config,
      fakeSettings({}),
    );
  });

  const row = (over: Record<string, unknown>) => ({
    id: 'rt1',
    clientId: 'claude',
    userId: 'u1',
    companyId: null,
    scope: 'brain:read',
    revoked: false,
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: 'u1', did: 'did:key:abc' },
    ...over,
  });

  async function refused(): Promise<unknown> {
    try {
      await issuer.refreshAccessToken('raw', 'claude');
    } catch (e) {
      return e;
    }
    throw new Error('refresh unexpectedly succeeded');
  }

  const cases: Array<[string, () => void]> = [
    ['unknown', () => prisma.refreshToken.findUnique.mockResolvedValue(null)],
    [
      'issued to another client',
      () => prisma.refreshToken.findUnique.mockResolvedValue(row({ clientId: 'other' })),
    ],
    [
      'replayed after rotation',
      () => prisma.refreshToken.findUnique.mockResolvedValue(row({ revoked: true })),
    ],
    [
      'expired',
      () => prisma.refreshToken.findUnique.mockResolvedValue(row({ expiresAt: new Date(0) })),
    ],
    [
      'lost a concurrent rotation',
      () => {
        prisma.refreshToken.findUnique.mockResolvedValue(row({}));
        prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      },
    ],
  ];

  it.each(cases)('%s', async (_name, arrange) => {
    arrange();
    const e = await refused();
    expect(e).toBeInstanceOf(BadRequestException);
    expect((e as BadRequestException).getResponse()).toMatchObject({ error: 'invalid_grant' });
  });

  it('a replay still revokes the whole family', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(row({ revoked: true }));
    await refused();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', clientId: 'claude', revoked: false } }),
    );
  });
});
