import * as crypto from 'crypto';

/**
 * Envelope format for an encrypted field value:
 *   v1.<iv-b64url>.<tag-b64url>.<ciphertext-b64url>
 *
 * AES-256-GCM with a random 96-bit IV per value. The GCM auth tag makes
 * tampering detectable (decrypt throws). Legacy plaintext values are left
 * untouched by decrypt() so 2FA keeps working while rows are lazily
 * re-encrypted on next verify (see IdentityMfaService).
 *
 * This is a deliberately small, dependency-free primitive so it can be
 * reused later for other at-rest secrets (Vault/KMS roadmap item) and from
 * one-off scripts without the Nest DI container.
 */
const VERSION = 'v1';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

export class FieldCrypto {
  private readonly key: Buffer | null;

  constructor(key: Buffer | null) {
    this.key = key;
  }

  /**
   * Build from the FIELD_ENCRYPTION_KEY env value. A missing key yields a
   * disabled instance that only throws when encryption is actually needed —
   * so deployments that never enable 2FA still boot without the key.
   */
  static fromEnv(secret?: string | null): FieldCrypto {
    if (!secret) return new FieldCrypto(null);
    return new FieldCrypto(FieldCrypto.deriveKey(secret));
  }

  /** Accept a 32-byte hex or base64 key verbatim; otherwise SHA-256 the input to 32 bytes. */
  private static deriveKey(secret: string): Buffer {
    if (/^[0-9a-fA-F]{64}$/.test(secret)) return Buffer.from(secret, 'hex');
    const asB64 = FieldCrypto.tryBase64(secret);
    if (asB64 && asB64.length === 32) return asB64;
    return crypto.createHash('sha256').update(secret, 'utf8').digest();
  }

  private static tryBase64(value: string): Buffer | null {
    try {
      return Buffer.from(value, 'base64');
    } catch {
      return null;
    }
  }

  /** True when a stored value is already in the v1 envelope format. */
  static isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(`${VERSION}.`) && value.split('.').length === 4;
  }

  encrypt(plaintext: string): string {
    const key = this.requireKey();
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
  }

  /** Decrypt a v1 envelope; passes legacy plaintext through unchanged. */
  decrypt(value: string): string {
    if (!FieldCrypto.isEncrypted(value)) return value;
    const key = this.requireKey();
    const [, ivB64, tagB64, ctB64] = value.split('.');
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new Error('FIELD_ENCRYPTION_KEY is not configured — required to encrypt/decrypt at-rest secrets (e.g. 2FA)');
    }
    return this.key;
  }
}
