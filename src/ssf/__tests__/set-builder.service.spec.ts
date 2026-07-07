import { SetBuilderService } from '../set-builder.service';
import { CAEP_EVENTS } from '../caep-event-types';
import * as jose from 'jose';

describe('SetBuilderService', () => {
  let privatePem: string;
  let publicKey: jose.CryptoKey;

  beforeAll(async () => {
    const kp = await jose.generateKeyPair('RS256', { extractable: true });
    privatePem = await jose.exportPKCS8(kp.privateKey);
    publicKey = kp.publicKey;
  });

  function build(env: Record<string, string | undefined>): SetBuilderService {
    return new SetBuilderService({ get: (k: string, d?: string) => env[k] ?? d } as any);
  }

  it('signs a verifiable SET with the CAEP events claim', async () => {
    const svc = build({ JWT_PRIVATE_KEY: privatePem, JWT_ISSUER: 'https://auth.example.com' });
    const result = await svc.build({
      eventType: CAEP_EVENTS.sessionRevoked,
      subject: 'did:key:zabc',
      audience: ['https://rp.example.com'],
    });
    expect(result).not.toBeNull();

    const { payload, protectedHeader } = await jose.jwtVerify(result!.jwt, publicKey, {
      issuer: 'https://auth.example.com',
      audience: 'https://rp.example.com',
    });
    expect(protectedHeader.typ).toBe('secevent+jwt');
    expect(protectedHeader.kid).toBe('auth-rs256-key-1');
    expect(payload.jti).toBe(result!.jti);
    expect((payload.events as any)[CAEP_EVENTS.sessionRevoked]).toBeDefined();
    expect((payload.sub_id as any).sub).toBe('did:key:zabc');
  });

  it('returns null in HS256/dev mode (no private key)', async () => {
    const svc = build({});
    const result = await svc.build({ eventType: CAEP_EVENTS.sessionRevoked, subject: 's', audience: [] });
    expect(result).toBeNull();
  });
});
