import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthClient } from '@prisma/client';
import { OAuthM2mService } from '../oauth-m2m.service';
import { JwksService } from '../../common/jwks.service';

/**
 * RFC 8705 §3.1 — a client-credentials token bound to a presented certificate
 * carries the cert thumbprint in `cnf["x5t#S256"]`, alongside a DPoP `jkt` when
 * both sender-constraining mechanisms are used.
 */
describe('mTLS — certificate-bound client_credentials token', () => {
  const client = {
    clientId: 'm2m-client',
    companyId: 'co-1',
    allowedScopes: ['api:read'],
    allowedAudiences: [],
  } as unknown as OAuthClient;

  let signed: Array<Record<string, unknown>>;
  let m2m: OAuthM2mService;

  beforeEach(() => {
    signed = [];
    const jwt = {
      sign: (payload: Record<string, unknown>) => {
        signed.push(payload);
        return 'signed.jwt';
      },
    } as unknown as JwtService;
    const config = {
      get: (_k: string, d?: string) => d ?? '',
    } as unknown as ConfigService;
    const jwks = { isRs256Enabled: () => false } as unknown as JwksService;
    m2m = new OAuthM2mService(jwt, config, jwks);
  });

  it('binds cnf["x5t#S256"] when a certificate thumbprint is supplied', async () => {
    await m2m.issueClientCredentialsToken({
      client,
      requestedScope: 'api:read',
      certThumbprint: 'THUMB123',
    });
    expect(signed[0]!.cnf).toEqual({ 'x5t#S256': 'THUMB123' });
  });

  it('carries both jkt and x5t#S256 when DPoP and mTLS are combined', async () => {
    await m2m.issueClientCredentialsToken({
      client,
      requestedScope: 'api:read',
      dpopJkt: 'JKT456',
      certThumbprint: 'THUMB123',
    });
    expect(signed[0]!.cnf).toEqual({ jkt: 'JKT456', 'x5t#S256': 'THUMB123' });
  });

  it('omits cnf entirely for a plain Bearer token', async () => {
    const result = await m2m.issueClientCredentialsToken({
      client,
      requestedScope: 'api:read',
    });
    expect(signed[0]!).not.toHaveProperty('cnf');
    expect(result.tokenType).toBe('Bearer');
  });
});
