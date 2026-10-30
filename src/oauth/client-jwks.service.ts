import { Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { OAuthClient } from '@prisma/client';
import * as jose from 'jose';
import { BlockedFetch, checkUrl, safeFetch, SafeFetchOptions } from '../common/safe-fetch';

/** Extra safeFetch options for the remote key fetch (tests inject a resolver). */
export const CLIENT_JWKS_FETCH_OPTIONS = Symbol('CLIENT_JWKS_FETCH_OPTIONS');

/**
 * Resolves the verification key set for a client, from either an inline RFC
 * 7517 JWK Set (`jwks`) or a remote `jwks_uri`. Shared by private_key_jwt
 * client authentication (RFC 7523) and signed request objects (JAR, RFC 9101).
 *
 * SSRF hardening: a `jwks_uri` is a URL the client chose (DCR lets anyone
 * register one), so it is fetched only through `safeFetch`: https, ports
 * 80/443, no address that is not public (checked at connect time, so a name
 * resolving to 127.0.0.1 or 169.254.169.254 is refused), no redirects (jose's
 * own fetch never followed them either), 3 s for the whole fetch, 64 KiB of
 * JSON at most. jose's remote key set caches keys, cools down between
 * refetches and re-fetches on a kid miss; one set is kept per URI so that
 * caching actually holds across requests.
 */
@Injectable()
export class ClientJwksService {
  private static readonly REMOTE_TIMEOUT_MS = 3000;
  private static readonly MAX_JWKS_BYTES = 64 * 1024;
  private static readonly MAX_CACHED_SETS = 500;

  private readonly remoteSets = new Map<string, jose.JWTVerifyGetKey>();

  constructor(
    @Optional()
    @Inject(CLIENT_JWKS_FETCH_OPTIONS)
    private readonly fetchOptions: Partial<SafeFetchOptions> = {},
  ) {}

  resolveKeySet(client: OAuthClient): jose.JWTVerifyGetKey {
    if (client.jwks && typeof client.jwks === 'object') {
      return jose.createLocalJWKSet(client.jwks as unknown as jose.JSONWebKeySet);
    }
    if (client.jwksUri) return this.remoteSet(client.jwksUri);
    throw new UnauthorizedException('client has no registered keys');
  }

  private remoteSet(jwksUri: string): jose.JWTVerifyGetKey {
    const cached = this.remoteSets.get(jwksUri);
    if (cached) return cached;
    let url: URL;
    try {
      url = checkUrl(jwksUri, { requireHttps: true, ...this.fetchOptions });
    } catch (err) {
      const why = err instanceof BlockedFetch ? err.message : 'invalid URL';
      throw new UnauthorizedException(`client jwks_uri refused (${why})`);
    }
    const set = jose.createRemoteJWKSet(url, {
      timeoutDuration: ClientJwksService.REMOTE_TIMEOUT_MS,
      [jose.customFetch]: (href, init) => this.fetchJwks(href, init),
    });
    if (this.remoteSets.size >= ClientJwksService.MAX_CACHED_SETS) {
      const oldest = this.remoteSets.keys().next().value;
      if (oldest !== undefined) this.remoteSets.delete(oldest);
    }
    this.remoteSets.set(jwksUri, set);
    return set;
  }

  /** jose's fetch, through safeFetch. Any refusal surfaces as a jose error. */
  private async fetchJwks(href: string, init: { headers: Headers; signal: AbortSignal }): Promise<Response> {
    const res = await safeFetch(href, {
      requireHttps: true,
      maxRedirects: 0,
      maxBytes: ClientJwksService.MAX_JWKS_BYTES,
      timeoutMs: ClientJwksService.REMOTE_TIMEOUT_MS,
      json: true,
      headers: Object.fromEntries(init.headers.entries()),
      signal: init.signal,
      ...this.fetchOptions,
    });
    return new Response(new Uint8Array(res.body), { status: res.status });
  }
}
