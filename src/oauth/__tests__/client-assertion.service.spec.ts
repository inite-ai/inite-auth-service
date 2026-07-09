import { ClientAssertionService, CLIENT_ASSERTION_TYPE } from '../client-assertion.service';
import { ClientJwksService } from '../client-jwks.service';
import { ClientAssertionJtiStore } from '../client-assertion-jti.store';
import { PrismaService } from '../../prisma/prisma.service';
import * as jose from 'jose';

const CLIENT_ID = 'client-abc';
const AUDIENCE = 'https://auth.example.com/v1/oauth/token';

describe('ClientAssertionService', () => {
  let priv: jose.CryptoKey;
  let publicJwk: jose.JWK;
  let prisma: { oAuthClient: { findFirst: jest.Mock } };
  let jtiStore: { consume: jest.Mock };
  let service: ClientAssertionService;

  beforeAll(async () => {
    const kp = await jose.generateKeyPair('RS256', { extractable: true });
    priv = kp.privateKey;
    publicJwk = await jose.exportJWK(kp.publicKey);
  });

  beforeEach(() => {
    prisma = {
      oAuthClient: {
        findFirst: jest.fn().mockResolvedValue({
          clientId: CLIENT_ID,
          active: true,
          tokenEndpointAuthMethod: 'private_key_jwt',
        }),
      },
    };
    jtiStore = { consume: jest.fn().mockResolvedValue(undefined) };
    const clientJwks = { resolveKeySet: () => jose.createLocalJWKSet({ keys: [publicJwk] }) };
    service = new ClientAssertionService(
      prisma as unknown as PrismaService,
      clientJwks as unknown as ClientJwksService,
      jtiStore as unknown as ClientAssertionJtiStore,
    );
  });

  async function mkAssertion(overrides: {
    iss?: string; sub?: string; aud?: string; jti?: string; expSec?: number; alg?: string; key?: jose.CryptoKey | Uint8Array;
  } = {}): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new jose.SignJWT({})
      .setProtectedHeader({ alg: overrides.alg ?? 'RS256' })
      .setIssuer(overrides.iss ?? CLIENT_ID)
      .setSubject(overrides.sub ?? CLIENT_ID)
      .setAudience(overrides.aud ?? AUDIENCE)
      .setJti(overrides.jti ?? 'jti-1')
      .setIssuedAt(now)
      .setExpirationTime(overrides.expSec ?? now + 60)
      .sign(overrides.key ?? priv);
  }

  it('authenticates a valid assertion and records the jti', async () => {
    const assertion = await mkAssertion();
    const client = await service.authenticate({ assertion, clientIdHint: CLIENT_ID, audiences: [AUDIENCE] });
    expect(client.clientId).toBe(CLIENT_ID);
    expect(jtiStore.consume).toHaveBeenCalledWith(expect.objectContaining({ clientId: CLIENT_ID, jti: 'jti-1' }));
  });

  it('rejects a wrong audience', async () => {
    const assertion = await mkAssertion({ aud: 'https://evil.example.com' });
    await expect(service.authenticate({ assertion, clientIdHint: CLIENT_ID, audiences: [AUDIENCE] })).rejects.toThrow();
  });

  it('rejects an expired assertion', async () => {
    const past = Math.floor(Date.now() / 1000) - 120;
    const assertion = await mkAssertion({ expSec: past });
    await expect(service.authenticate({ assertion, clientIdHint: CLIENT_ID, audiences: [AUDIENCE] })).rejects.toThrow();
  });

  it('rejects iss !== sub', async () => {
    const assertion = await mkAssertion({ iss: 'someone-else' });
    await expect(service.authenticate({ assertion, clientIdHint: CLIENT_ID, audiences: [AUDIENCE] })).rejects.toThrow(/iss\/sub/);
  });

  it('rejects an HS256 (symmetric) assertion', async () => {
    const secret = new TextEncoder().encode('a'.repeat(32));
    const assertion = await mkAssertion({ alg: 'HS256', key: secret });
    await expect(service.authenticate({ assertion, clientIdHint: CLIENT_ID, audiences: [AUDIENCE] })).rejects.toThrow(/not allowed/);
  });

  it('rejects a client not registered for private_key_jwt', async () => {
    prisma.oAuthClient.findFirst.mockResolvedValue({ clientId: CLIENT_ID, active: true, tokenEndpointAuthMethod: 'client_secret_post' });
    const assertion = await mkAssertion();
    await expect(service.authenticate({ assertion, clientIdHint: CLIENT_ID, audiences: [AUDIENCE] })).rejects.toThrow(/private_key_jwt/);
  });

  it('rejects an over-long lifetime', async () => {
    const now = Math.floor(Date.now() / 1000);
    const assertion = await mkAssertion({ expSec: now + 3600 });
    await expect(service.authenticate({ assertion, clientIdHint: CLIENT_ID, audiences: [AUDIENCE] })).rejects.toThrow(/lifetime/);
  });

  it('surfaces a replay (jti store throws)', async () => {
    jtiStore.consume.mockRejectedValue(new Error('replayed'));
    const assertion = await mkAssertion();
    await expect(service.authenticate({ assertion, clientIdHint: CLIENT_ID, audiences: [AUDIENCE] })).rejects.toThrow();
  });

  it('exposes the RFC 7523 assertion type constant', () => {
    expect(CLIENT_ASSERTION_TYPE).toContain('jwt-bearer');
  });
});
