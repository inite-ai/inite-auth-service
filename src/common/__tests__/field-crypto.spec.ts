import { FieldCrypto } from '../field-crypto';
import * as crypto from 'crypto';

describe('FieldCrypto', () => {
  const key = crypto.randomBytes(32).toString('base64');
  const fc = FieldCrypto.fromEnv(key);

  it('round-trips a value', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const enc = fc.encrypt(secret);
    expect(enc).not.toBe(secret);
    expect(enc.startsWith('v1.')).toBe(true);
    expect(FieldCrypto.isEncrypted(enc)).toBe(true);
    expect(fc.decrypt(enc)).toBe(secret);
  });

  it('produces a distinct ciphertext per call (random IV)', () => {
    const a = fc.encrypt('same');
    const b = fc.encrypt('same');
    expect(a).not.toBe(b);
    expect(fc.decrypt(a)).toBe('same');
    expect(fc.decrypt(b)).toBe('same');
  });

  it('passes legacy plaintext through decrypt unchanged', () => {
    expect(FieldCrypto.isEncrypted('JBSWY3DPEHPK3PXP')).toBe(false);
    expect(fc.decrypt('JBSWY3DPEHPK3PXP')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('throws on a tampered ciphertext (GCM auth tag)', () => {
    const enc = fc.encrypt('secret');
    const parts = enc.split('.');
    const ctBuf = Buffer.from(parts[3], 'base64url');
    ctBuf[0] ^= 0xff;
    parts[3] = ctBuf.toString('base64url');
    expect(() => fc.decrypt(parts.join('.'))).toThrow();
  });

  it('cannot decrypt with a different key', () => {
    const enc = fc.encrypt('secret');
    const other = FieldCrypto.fromEnv(crypto.randomBytes(32).toString('base64'));
    expect(() => other.decrypt(enc)).toThrow();
  });

  it('accepts a 64-char hex key verbatim', () => {
    const hexFc = FieldCrypto.fromEnv(crypto.randomBytes(32).toString('hex'));
    expect(hexFc.decrypt(hexFc.encrypt('x'))).toBe('x');
  });

  it('derives a 32-byte key from an arbitrary passphrase', () => {
    const passFc = FieldCrypto.fromEnv('a short passphrase that is not 32 bytes');
    expect(passFc.decrypt(passFc.encrypt('x'))).toBe('x');
  });

  it('throws a clear error when no key is configured and encryption is needed', () => {
    const disabled = FieldCrypto.fromEnv(undefined);
    expect(() => disabled.encrypt('x')).toThrow(/FIELD_ENCRYPTION_KEY/);
    // but decrypt of legacy plaintext is still a safe no-op
    expect(disabled.decrypt('legacy')).toBe('legacy');
  });
});
