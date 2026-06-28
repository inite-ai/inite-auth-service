import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jose from 'jose';

export const JWKS_KID = 'auth-rs256-key-1';

@Injectable()
export class JwksService implements OnModuleInit {
  private jwks: { keys: jose.JWK[] } = { keys: [] };

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.jwks = await this.buildJwks();
  }

  private async buildJwks(): Promise<{ keys: jose.JWK[] }> {
    const publicKeyPem = this.config.get<string>('JWT_PUBLIC_KEY');
    if (!publicKeyPem) return { keys: [] };

    try {
      const pem = this.normalizePem(publicKeyPem, 'PUBLIC KEY');
      const publicKey = await jose.importSPKI(pem, 'RS256');
      const jwk = await jose.exportJWK(publicKey);
      return {
        keys: [
          {
            ...jwk,
            kid: JWKS_KID,
            alg: 'RS256',
            use: 'sig',
          },
        ],
      };
    } catch {
      return { keys: [] };
    }
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
}
