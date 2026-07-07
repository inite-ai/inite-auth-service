import { RequestObjectService } from '../request-object.service';
import * as jose from 'jose';

const CLIENT_ID = 'client-jar';

describe('RequestObjectService (JAR)', () => {
  let priv: jose.CryptoKey;
  let publicJwk: jose.JWK;
  let registry: any;
  let service: RequestObjectService;

  beforeAll(async () => {
    const kp = await jose.generateKeyPair('ES256', { extractable: true });
    priv = kp.privateKey;
    publicJwk = await jose.exportJWK(kp.publicKey);
  });

  beforeEach(() => {
    registry = { validateClient: jest.fn().mockResolvedValue({ clientId: CLIENT_ID }) };
    const clientJwks = { resolveKeySet: () => jose.createLocalJWKSet({ keys: [publicJwk] }) };
    service = new RequestObjectService(registry, clientJwks as any);
  });

  async function mkRequest(claims: Record<string, unknown>, alg = 'ES256'): Promise<string> {
    return new jose.SignJWT(claims).setProtectedHeader({ alg }).sign(priv);
  }

  it('verifies and returns the authorize params', async () => {
    const request = await mkRequest({ client_id: CLIENT_ID, scope: 'openid profile', redirect_uri: 'https://rp/cb' });
    const params = await service.resolve({ request, clientId: CLIENT_ID });
    expect(params.scope).toBe('openid profile');
    expect(params.redirect_uri).toBe('https://rp/cb');
  });

  it('rejects a request object whose client_id mismatches', async () => {
    const request = await mkRequest({ client_id: 'other', scope: 'openid' });
    await expect(service.resolve({ request, clientId: CLIENT_ID })).rejects.toThrow(/mismatch/);
  });

  it('rejects an unsigned (alg none) request object', async () => {
    const unsigned = new jose.UnsecuredJWT({ client_id: CLIENT_ID }).encode();
    await expect(service.resolve({ request: unsigned, clientId: CLIENT_ID })).rejects.toThrow(/not allowed/);
  });
});
