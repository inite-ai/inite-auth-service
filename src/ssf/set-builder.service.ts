import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as jose from 'jose';
import { JWKS_KID } from '../common/jwks.service';

/**
 * Builds signed Security Event Tokens (SET, RFC 8417) for CAEP/RISC events.
 * Signed with the active RS256 signing key + kid, so receivers verify against
 * the same /.well-known/jwks.json as normal tokens. `typ: secevent+jwt`.
 */
@Injectable()
export class SetBuilderService {
  constructor(private readonly config: ConfigService) {}

  async build(input: {
    eventType: string;
    subject: string;
    audience: string[];
    claims?: Record<string, unknown>;
  }): Promise<{ jwt: string; jti: string } | null> {
    const privateKeyPem = this.config.get<string>('JWT_PRIVATE_KEY');
    if (!privateKeyPem) return null; // HS256/dev mode — no SET signing

    const issuer = this.config.get<string>('JWT_ISSUER', 'http://localhost:3002');
    const jti = crypto.randomUUID();
    const key = await jose.importPKCS8(this.normalizePem(privateKeyPem), 'RS256');

    const jwt = await new jose.SignJWT({
      sub_id: { format: 'iss_sub', iss: issuer, sub: input.subject },
      events: { [input.eventType]: input.claims ?? {} },
    })
      .setProtectedHeader({ alg: 'RS256', kid: JWKS_KID, typ: 'secevent+jwt' })
      .setIssuer(issuer)
      .setSubject(input.subject)
      .setAudience(input.audience)
      .setIssuedAt()
      .setJti(jti)
      .sign(key);

    return { jwt, jti };
  }

  private normalizePem(pem: string): string {
    const trimmed = pem.trim().replace(/\\n/g, '\n');
    if (trimmed.includes('-----BEGIN')) return trimmed;
    const lines = trimmed.replace(/\s/g, '').match(/.{1,64}/g) ?? [];
    return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;
  }
}
