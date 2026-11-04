import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthClient } from '@prisma/client';
import { OAuthM2mService } from '../oauth-m2m.service';
import { JwksService } from '../../common/jwks.service';
import { fakeSettings } from '../../common/settings/settings.test-fixture';

/**
 * The M2M token's `exp` and the `expires_in` the client is told are the same
 * number. Before, the TTL setting went to the signer as a string, and
 * jsonwebtoken reads a unitless string as milliseconds: `3600` signed a
 * 3.6 s token while the response said 3600 s.
 */
describe('M2M token lifetime: the signed exp matches expires_in', () => {
  const client = {
    clientId: 'm2m',
    allowedGrants: ['client_credentials'],
    allowedScopes: ['billing:read'],
    allowedAudiences: [],
    companyId: 'co-1',
    active: true,
  } as unknown as OAuthClient;

  it.each([
    ['3600', 3600],
    ['10m', 600],
    ['1h', 3600],
  ])('JWT_M2M_ACCESS_TOKEN_EXPIRY=%s', async (ttl, seconds) => {
    const jwt = new JwtService({ secret: 'test-only-signing-secret-of-32-chars!' });
    const config = { get: (_k: string, d?: string) => d ?? '' } as unknown as ConfigService;
    const service = new OAuthM2mService(
      jwt,
      config,
      { isRs256Enabled: () => false } as unknown as JwksService,
      fakeSettings({ JWT_M2M_ACCESS_TOKEN_EXPIRY: ttl }),
    );
    const issued = await service.issueClientCredentialsToken({ client });
    const { exp, iat } = jwt.decode<{ exp: number; iat: number }>(issued.accessToken);
    expect(issued.expiresIn).toBe(seconds);
    expect(exp - iat).toBe(seconds);
  });
});
