import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as jose from 'jose';
import { RedisService } from '../common/redis.service';

/**
 * DPoP (RFC 9449) proof validator.
 *
 * DPoP gives M2M tokens "sender-constrained" semantics — the
 * resource server only accepts an access token when the caller
 * also presents a fresh signed proof generated with the same key
 * the IdP bound to that token. Steals of the bearer token alone
 * are useless without the private key.
 *
 * What this service validates on a single proof:
 *   1. JWT structure with `typ: 'dpop+jwt'` and an `alg` from the
 *      allow-list (RS256 excluded to push callers to ES256/EdDSA;
 *      RSA proofs are needlessly bulky for one-shot signatures).
 *   2. Embedded `jwk` is the public key used to verify the proof.
 *      (No JWKS lookup — the client carries its own key.)
 *   3. `htu` matches the requested URL (case-insensitive on host,
 *      query string ignored), `htm` matches the method.
 *   4. `iat` within ±60s of now (clock skew tolerance).
 *   5. `jti` not seen before within the iat window — guarded by
 *      Redis with 90s TTL (longer than the iat window so an
 *      attacker can't replay just outside the freshness check).
 *
 * On success returns `{ jkt }` — the RFC 7638 JWK thumbprint that
 * gets bound to the issued token's `cnf.jkt` claim.
 */
export interface DpopProofResult {
  jkt: string;
  alg: string;
}

const ALLOWED_ALGS = new Set<string>(['ES256', 'ES384', 'ES512', 'EdDSA']);
const IAT_TOLERANCE_S = 60;
const JTI_TTL_S = 90;

@Injectable()
export class DpopService {
  private readonly logger = new Logger(DpopService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Validate a DPoP proof and return its key thumbprint.
   *
   * @param proof  The raw value of the `DPoP` HTTP header.
   * @param method The HTTP method of the protected request (e.g. 'POST').
   * @param url    The full URL of the protected request, no query.
   *
   * Throws BadRequestException on malformed / spec violations,
   * UnauthorizedException on replay or invalid signature.
   */
  async validate(
    proof: string,
    method: string,
    url: string,
  ): Promise<DpopProofResult> {
    const { header, payload } = this.decodeProof(proof);
    const { alg, jwk } = this.validateProofHeader(header);
    await this.verifyProofSignature(proof, jwk, alg);
    this.assertBindings(payload, method, url);
    const jkt = await this.assertNotReplayed(payload, jwk);
    return { jkt, alg };
  }

  private decodeProof(proof: string): { header: any; payload: any } {
    try {
      return {
        header: jose.decodeProtectedHeader(proof),
        payload: jose.decodeJwt(proof),
      };
    } catch {
      throw new BadRequestException('Malformed DPoP proof');
    }
  }

  private validateProofHeader(header: any): { alg: string; jwk: any } {
    if (header.typ !== 'dpop+jwt') {
      throw new BadRequestException('DPoP proof: typ must be dpop+jwt');
    }
    const alg = String(header.alg ?? '');
    if (!ALLOWED_ALGS.has(alg)) {
      throw new BadRequestException(`DPoP proof: alg ${alg} not allowed`);
    }
    const jwk = header.jwk;
    if (!jwk || typeof jwk !== 'object') {
      throw new BadRequestException('DPoP proof: jwk header missing');
    }
    // Spec forbids the proof JWT from embedding a `d` (private key).
    if ('d' in jwk) {
      throw new BadRequestException(
        'DPoP proof: jwk must not contain private parameters',
      );
    }
    return { alg, jwk };
  }

  private async verifyProofSignature(
    proof: string,
    jwk: any,
    alg: string,
  ): Promise<void> {
    const key = await jose.importJWK(jwk, alg);
    try {
      await jose.jwtVerify(proof, key, { algorithms: [alg] });
    } catch (e: any) {
      throw new UnauthorizedException(
        `DPoP proof signature invalid: ${e?.code ?? e?.message ?? 'unknown'}`,
      );
    }
  }

  private assertBindings(payload: any, method: string, url: string): void {
    // htm / htu binding — defeats proof reuse on a different
    // endpoint with the same key.
    if (typeof payload.htm !== 'string' || payload.htm.toUpperCase() !== method.toUpperCase()) {
      throw new BadRequestException('DPoP proof: htm mismatch');
    }
    if (typeof payload.htu !== 'string' || !this.urlsEqual(payload.htu, url)) {
      throw new BadRequestException('DPoP proof: htu mismatch');
    }

    // iat freshness.
    const now = Math.floor(Date.now() / 1000);
    const iat = Number(payload.iat ?? 0);
    if (!Number.isFinite(iat) || Math.abs(now - iat) > IAT_TOLERANCE_S) {
      throw new BadRequestException('DPoP proof: iat outside freshness window');
    }
  }

  private async assertNotReplayed(payload: any, jwk: any): Promise<string> {
    // Replay protection — single-use jti within the freshness window.
    if (typeof payload.jti !== 'string' || payload.jti.length === 0) {
      throw new BadRequestException('DPoP proof: jti required');
    }
    const jktForKey = await jose.calculateJwkThumbprint(jwk as any);
    const jtiKey = `dpop:jti:${jktForKey}:${payload.jti}`;
    const stored = await this.redis.get(jtiKey);
    if (stored) {
      throw new UnauthorizedException('DPoP proof replayed');
    }
    await this.redis.set(jtiKey, '1', JTI_TTL_S);

    return jktForKey;
  }

  /**
   * htu comparison per RFC 9449 §4.3 — exact match on the requested
   * URL minus query / fragment. Hostname compared case-insensitively
   * because DNS is case-insensitive; path is case-sensitive.
   */
  private urlsEqual(a: string, b: string): boolean {
    try {
      const ua = new URL(a);
      const ub = new URL(b);
      return (
        ua.protocol === ub.protocol &&
        ua.hostname.toLowerCase() === ub.hostname.toLowerCase() &&
        (ua.port || this.defaultPort(ua.protocol)) ===
          (ub.port || this.defaultPort(ub.protocol)) &&
        ua.pathname === ub.pathname
      );
    } catch {
      return false;
    }
  }

  private defaultPort(protocol: string): string {
    if (protocol === 'https:') return '443';
    if (protocol === 'http:') return '80';
    return '';
  }
}
