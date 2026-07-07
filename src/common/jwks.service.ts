import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jose from 'jose';

/** Default kid for the active signing key — kept stable for backward compat
 * so tokens already in flight (whose header carries this kid) keep verifying
 * against the JWKS after an upgrade. */
export const JWKS_KID = 'auth-rs256-key-1';

type KeyRole = 'active' | 'next' | 'prev';

interface KeyEntry {
  kid: string;
  publicKeyPem: string;
  role: KeyRole;
}

/**
 * Owns the RS256 signing/verification key SET (not just the active key), so
 * keys can be rotated with an overlap window and zero downtime:
 *
 *   active  — JWT_PRIVATE_KEY/JWT_PUBLIC_KEY, kid JWT_ACTIVE_KID (default
 *             auth-rs256-key-1). This is what JwtModule signs with.
 *   next    — JWT_PUBLIC_KEY_NEXT, kid JWT_KID_NEXT (default auth-rs256-key-2).
 *             Published before it becomes active so RPs pre-cache it.
 *   prev    — JWT_PUBLIC_KEY_PREV, kid JWT_KID_PREV (default auth-rs256-key-0).
 *             The just-retired key, kept until every token it signed expires.
 *
 * All present public keys are published at /.well-known/jwks.json, and
 * verification resolves the right key by the token's `kid` header — so a
 * token signed by any non-retired key validates during the overlap. See
 * docs/KEY-ROTATION.md for the operational procedure.
 */
@Injectable()
export class JwksService implements OnModuleInit {
  private readonly logger = new Logger(JwksService.name);
  private entries: KeyEntry[] = [];
  private jwks: { keys: jose.JWK[] } = { keys: [] };

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.entries = this.loadEntries();
    this.jwks = await this.buildJwks(this.entries);
    if (this.entries.length > 1) {
      this.logger.log(
        `JWKS overlap window active — publishing ${this.entries.length} keys: ` +
          this.entries.map((e) => `${e.kid}(${e.role})`).join(', '),
      );
    }
  }

  private loadEntries(): KeyEntry[] {
    const specs: Array<{ role: KeyRole; publicKeyPem?: string; kid: string }> = [
      { role: 'active', publicKeyPem: this.config.get<string>('JWT_PUBLIC_KEY'), kid: this.config.get<string>('JWT_ACTIVE_KID', JWKS_KID) },
      { role: 'next', publicKeyPem: this.config.get<string>('JWT_PUBLIC_KEY_NEXT'), kid: this.config.get<string>('JWT_KID_NEXT', 'auth-rs256-key-2') },
      { role: 'prev', publicKeyPem: this.config.get<string>('JWT_PUBLIC_KEY_PREV'), kid: this.config.get<string>('JWT_KID_PREV', 'auth-rs256-key-0') },
    ];
    return specs
      .filter((s): s is KeyEntry => !!s.publicKeyPem)
      .map((s) => ({ kid: s.kid, publicKeyPem: s.publicKeyPem, role: s.role }));
  }

  private async buildJwks(entries: KeyEntry[]): Promise<{ keys: jose.JWK[] }> {
    const keys: jose.JWK[] = [];
    for (const entry of entries) {
      try {
        const publicKey = await jose.importSPKI(this.normalizePem(entry.publicKeyPem, 'PUBLIC KEY'), 'RS256');
        const jwk = await jose.exportJWK(publicKey);
        keys.push({ ...jwk, kid: entry.kid, alg: 'RS256', use: 'sig' });
      } catch {
        this.logger.warn(`Skipping malformed ${entry.role} signing key (${entry.kid})`);
      }
    }
    return { keys };
  }

  private normalizePem(pem: string, label: string): string {
    const trimmed = pem.trim().replace(/\\n/g, '\n');
    if (trimmed.includes('-----BEGIN')) return trimmed;
    const lines = trimmed.replace(/\s/g, '').match(/.{1,64}/g) ?? [];
    return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
  }

  /** JWKS JSON for GET /.well-known/jwks.json */
  getJwks(): { keys: jose.JWK[] } {
    return this.jwks;
  }

  /** Whether RS256/JWKS mode is active (vs HS256 fallback) */
  isRs256Enabled(): boolean {
    return !!(this.config.get<string>('JWT_PRIVATE_KEY') && this.config.get<string>('JWT_PUBLIC_KEY'));
  }

  /** kid of the key JwtModule currently signs with. */
  getActiveKid(): string {
    return this.entries.find((e) => e.role === 'active')?.kid ?? JWKS_KID;
  }

  /**
   * Resolve the public-key PEM to verify a token with, keyed off its `kid`
   * header. Falls back to the active key when the token carries no kid or an
   * unrecognized one (so a legacy no-kid token still verifies). Returns
   * undefined in HS256 mode.
   */
  verificationKeyForToken(token: string): string | undefined {
    const kid = this.decodeKid(token);
    if (kid) {
      const match = this.entries.find((e) => e.kid === kid);
      if (match) return this.normalizePem(match.publicKeyPem, 'PUBLIC KEY');
    }
    const active = this.entries.find((e) => e.role === 'active');
    return active ? this.normalizePem(active.publicKeyPem, 'PUBLIC KEY') : undefined;
  }

  private decodeKid(token: string): string | undefined {
    try {
      return jose.decodeProtectedHeader(token).kid;
    } catch {
      return undefined;
    }
  }
}
