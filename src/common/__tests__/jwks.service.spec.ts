import { JwksService } from '../jwks.service';
import * as jose from 'jose';

/**
 * Exercises the multi-key rotation logic with real RSA keys. Uses jose to
 * generate keypairs and sign tokens, then asserts JWKS publication and
 * kid-aware verification-key resolution.
 */
describe('JwksService (rotation)', () => {
  let activePub: string;
  let activePriv: jose.CryptoKey;
  let nextPub: string;
  let nextPriv: jose.CryptoKey;

  beforeAll(async () => {
    const active = await jose.generateKeyPair('RS256', { extractable: true });
    const next = await jose.generateKeyPair('RS256', { extractable: true });
    activePub = await jose.exportSPKI(active.publicKey);
    activePriv = active.privateKey;
    nextPub = await jose.exportSPKI(next.publicKey);
    nextPriv = next.privateKey;
  });

  function build(env: Record<string, string | undefined>): JwksService {
    const config = { get: (k: string, d?: string) => env[k] ?? d } as any;
    return new JwksService(config);
  }

  async function sign(priv: jose.CryptoKey, kid: string): Promise<string> {
    return new jose.SignJWT({ sub: 'u1' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(priv);
  }

  it('single-key legacy env publishes one key under the default kid', async () => {
    const svc = build({ JWT_PUBLIC_KEY: activePub, JWT_PRIVATE_KEY: 'x' });
    await svc.onModuleInit();
    expect(svc.getJwks().keys).toHaveLength(1);
    expect(svc.getJwks().keys[0].kid).toBe('auth-rs256-key-1');
    expect(svc.getActiveKid()).toBe('auth-rs256-key-1');
  });

  it('publishes active + next during an overlap window with distinct kids', async () => {
    const svc = build({ JWT_PUBLIC_KEY: activePub, JWT_PRIVATE_KEY: 'x', JWT_PUBLIC_KEY_NEXT: nextPub });
    await svc.onModuleInit();
    const kids = svc.getJwks().keys.map((k) => k.kid);
    expect(kids).toEqual(['auth-rs256-key-1', 'auth-rs256-key-2']);
  });

  it('resolves the verification key by the token kid', async () => {
    const svc = build({ JWT_PUBLIC_KEY: activePub, JWT_PRIVATE_KEY: 'x', JWT_PUBLIC_KEY_NEXT: nextPub });
    await svc.onModuleInit();

    // a token signed by the NEXT key must verify against the NEXT public key
    const nextToken = await sign(nextPriv, 'auth-rs256-key-2');
    const nextKey = await jose.importSPKI(svc.verificationKeyForToken(nextToken)!, 'RS256');
    await expect(jose.jwtVerify(nextToken, nextKey)).resolves.toBeDefined();

    // and an active-key token verifies against the active key
    const activeToken = await sign(activePriv, 'auth-rs256-key-1');
    const activeKey = await jose.importSPKI(svc.verificationKeyForToken(activeToken)!, 'RS256');
    await expect(jose.jwtVerify(activeToken, activeKey)).resolves.toBeDefined();
  });

  it('falls back to the active key for an unknown or missing kid', async () => {
    const svc = build({ JWT_PUBLIC_KEY: activePub, JWT_PRIVATE_KEY: 'x' });
    await svc.onModuleInit();
    const unknown = await sign(activePriv, 'some-unknown-kid');
    const resolved = svc.verificationKeyForToken(unknown);
    const key = await jose.importSPKI(resolved!, 'RS256');
    // active key was used as fallback → verifies the active-signed token
    await expect(jose.jwtVerify(unknown, key)).resolves.toBeDefined();
  });

  it('is a no-op resolver in HS256 mode (no RS keys)', async () => {
    const svc = build({});
    await svc.onModuleInit();
    expect(svc.getJwks().keys).toHaveLength(0);
    expect(svc.isRs256Enabled()).toBe(false);
    expect(svc.verificationKeyForToken('whatever')).toBeUndefined();
  });
});
