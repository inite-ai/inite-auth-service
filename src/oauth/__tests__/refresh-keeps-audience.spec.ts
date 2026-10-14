import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthTokenIssuerService } from '../oauth-token-issuer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { fakeSettings } from '../../common/settings/settings.test-fixture';
import type { User } from '@prisma/client';

/**
 * RFC 8707: an access token bound to a resource (an MCP server) must stay
 * bound after refresh-token rotation. Before, rotation re-issued it with the
 * clientId audience and the resource server rejected the next call.
 */
describe('refresh rotation keeps the RFC 8707 audience', () => {
  const user = { id: 'u1', did: 'did:key:abc', email: 'a@b.com' } as unknown as User;
  const MCP = 'https://inite.ai/api/mcp';
  let audiences: Array<unknown>;
  let created: Array<Record<string, unknown>>;
  let issuer: OAuthTokenIssuerService;
  let prisma: {
    oAuthClient: { findUnique: jest.Mock };
    refreshToken: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
  };

  beforeEach(() => {
    audiences = [];
    created = [];
    const jwt = {
      sign: (_payload: Record<string, unknown>, opts: { audience?: unknown }) => {
        audiences.push(opts?.audience);
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

  const rotate = async (resource: string | null) => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      clientId: 'inite-cli',
      userId: 'u1',
      scope: 'openid',
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
      amr: [],
      authorizationDetails: null,
      resource,
      user,
    });
    await issuer.refreshAccessToken('raw-refresh-token', 'inite-cli');
  };

  it('persists the bound resource at issue time', async () => {
    await issuer.generateTokens({ user, clientId: 'inite-cli', scope: 'openid', audience: MCP });
    expect(audiences[0]).toBe(MCP);
    expect(created[0]!.resource).toBe(MCP);
  });

  it('re-binds the rotated access token to the same resource', async () => {
    await rotate(MCP);
    expect(audiences[0]).toBe(MCP);
    expect(created[0]!.resource).toBe(MCP);
  });

  it('a token minted without a resource keeps the clientId audience', async () => {
    await rotate(null);
    expect(audiences[0]).toBe('inite-cli');
    expect(created[0]!.resource).toBeNull();
  });
});
