import { Injectable, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { RedisService } from '../common/redis.service';

/**
 * Pushed Authorization Requests (RFC 9126).
 *
 * Lets the client push authorize parameters server-to-server and
 * get back a `request_uri` to use in place of the long query
 * string at /authorize. Wins:
 *   1. Privacy — authorize-params don't traverse the user agent /
 *      browser history.
 *   2. Integrity — the IdP authenticates the client BEFORE the
 *      authorize redirect, so PKCE downgrade / parameter-tampering
 *      attacks are constrained at the front door rather than at
 *      token exchange.
 *
 * request_uri format: `urn:ietf:params:oauth:request_uri:<48b base64url>`.
 * Stored in Redis with a short TTL (60 s by spec recommendation —
 * the user has to start the browser flow within that window).
 */
const REQUEST_URI_PREFIX = 'urn:ietf:params:oauth:request_uri:';
const PAR_TTL_SECONDS = 60;

export interface ParPayload {
  clientId: string;
  redirectUri: string;
  responseType?: string;
  scope?: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  nonce?: string;
  acrValues?: string;
  prompt?: string;
}

@Injectable()
export class ParService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Persist the pushed authorize parameters and return the
   * request_uri the caller should hand to the user agent.
   */
  async push(payload: ParPayload): Promise<{ requestUri: string; expiresIn: number }> {
    if (!payload.clientId) throw new BadRequestException('client_id is required');
    if (!payload.redirectUri) throw new BadRequestException('redirect_uri is required');

    const ref = randomBytes(36).toString('base64url');
    const requestUri = `${REQUEST_URI_PREFIX}${ref}`;
    await this.redis.set(
      this.key(requestUri),
      JSON.stringify(payload),
      PAR_TTL_SECONDS,
    );
    return { requestUri, expiresIn: PAR_TTL_SECONDS };
  }

  /**
   * Atomically consume a request_uri (PAR refs are single-use per
   * spec §4.1). Returns null when the URI is unknown / expired /
   * already used so the caller can return a 400 to the user agent.
   */
  async consume(requestUri: string, clientId: string): Promise<ParPayload | null> {
    if (!requestUri.startsWith(REQUEST_URI_PREFIX)) return null;
    const raw = await this.redis.getDel(this.key(requestUri));
    if (!raw) return null;
    let parsed: ParPayload;
    try {
      parsed = JSON.parse(raw) as ParPayload;
    } catch {
      return null;
    }
    // Bind to the authenticating client — a different client cannot
    // present another tenant's pushed request_uri.
    if (parsed.clientId !== clientId) return null;
    return parsed;
  }

  private key(requestUri: string): string {
    return `par:${requestUri}`;
  }
}
