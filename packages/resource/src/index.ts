/**
 * @inite/auth-resource — server-side access-token verification for INITE
 * resource services (verticals like brain, inbox).
 *
 * What it does:
 *   - JWT verification against the IdP's remote JWKS (RS256 by default,
 *     kid-rotation aware, keys cached by jose's remote JWK set).
 *   - iss / aud / exp enforcement — a token minted for another vertical
 *     never passes.
 *   - Tenant/user claim mapping shared by all verticals:
 *       `org` present  → tenant = org (companyId), user = sub (did:key)
 *       `org` absent   → tenant = sub (M2M client_credentials token)
 *   - RFC 7662 introspection fallback for opaque credentials (API keys),
 *     when configured with a confidential client.
 *
 * Framework-free; the NestJS guard + decorator live in `./nest`.
 */

import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';

/** Hard cap mirroring brain's resolver — a hostile token can't stuff scopes. */
const MAX_SCOPES = 64;

/** RFC 7662 client credentials used for the opaque-token fallback. */
export interface IntrospectionConfig {
  clientId: string;
  clientSecret: string;
  /** Override the endpoint; defaults to `${issuer}/v1/oauth/introspect`. */
  url?: string;
}

export interface ResourceVerifierConfig {
  /** Trusted issuer, e.g. https://auth.inite.ai */
  issuer: string;
  /** This service's audience(s), e.g. 'brain'. Tokens for another aud are rejected. */
  audience: string | string[];
  /** Defaults to `${issuer}/.well-known/jwks.json`. */
  jwksUrl?: string;
  /** Accepted signature algorithms. Defaults to ['RS256']. */
  algorithms?: string[];
  /** Clock skew tolerance, seconds. Defaults to 5. */
  clockToleranceSec?: number;
  /** Enable the RFC 7662 fallback for non-JWT (opaque) credentials. */
  introspection?: IntrospectionConfig;
  /**
   * Custom jose key source — a test seam (createLocalJWKSet) or an
   * air-gapped key set. Defaults to createRemoteJWKSet(jwksUrl).
   */
  keySource?: JWTVerifyGetKey;
  /** fetch override for introspection (tests / custom agents). */
  fetchFn?: typeof fetch;
}

/** The identity a verified token grants to the request. */
export interface VerifiedPrincipal {
  /** Raw `sub` — user did:key, or the client's companyId/clientId for M2M. */
  subject: string;
  /** Tenant the request operates in: `org` claim, else `sub`. */
  tenantId: string;
  /** Per-user attribution — set only for user-bound tokens (`org` present). */
  userId?: string;
  /** Organization UUID (`org_id` claim) when the IdP stamped one. */
  organizationId?: string;
  scopes: string[];
  roles: string[];
  entitlements: string[];
  /** RFC 8693 `act` — the client acting on the subject's behalf. */
  actor?: { sub?: string; client_id?: string };
  clientId?: string;
  /** 'jwt' = local JWKS verification; 'introspected' = RFC 7662 round-trip. */
  via: 'jwt' | 'introspected';
  /** Full claim set for anything not first-classed above. */
  claims: Record<string, unknown>;
}

/** Thrown on any verification failure. `code` is stable for mapping to 401s. */
export class TokenVerificationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'invalid_token'
      | 'unsupported_credential'
      | 'introspection_unavailable' = 'invalid_token',
  ) {
    super(message);
    this.name = 'TokenVerificationError';
  }
}

/** Three base64url segments — cheap JWT-shape probe, not validation. */
function isJwtShaped(token: string): boolean {
  return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

/** `scopes` array wins; `scope` space-delimited string is the OAuth fallback. */
function extractScopes(claims: Record<string, unknown>): string[] {
  const fromArray = asStringArray(claims.scopes);
  if (fromArray.length > 0) return fromArray.slice(0, MAX_SCOPES);
  if (typeof claims.scope === 'string') {
    return claims.scope.split(/\s+/).filter(Boolean).slice(0, MAX_SCOPES);
  }
  return [];
}

function extractActor(claims: Record<string, unknown>): VerifiedPrincipal['actor'] {
  const act = claims.act;
  if (!act || typeof act !== 'object') return undefined;
  const a = act as Record<string, unknown>;
  return {
    ...(typeof a.sub === 'string' ? { sub: a.sub } : {}),
    ...(typeof a.client_id === 'string' ? { client_id: a.client_id } : {}),
  };
}

/**
 * The one tenant/user mapping rule every vertical shares. Keeping it in the
 * package (not per-vertical) is the point: brain, inbox, etc. resolve the
 * same token to the same tenant.
 */
export function principalFromClaims(
  claims: Record<string, unknown>,
  via: VerifiedPrincipal['via'],
): VerifiedPrincipal {
  const sub = typeof claims.sub === 'string' ? claims.sub : '';
  if (!sub) {
    throw new TokenVerificationError('Token has no sub claim');
  }
  const org = typeof claims.org === 'string' && claims.org.length > 0 ? claims.org : undefined;
  return {
    subject: sub,
    tenantId: org ?? sub,
    ...(org ? { userId: sub } : {}),
    ...(typeof claims.org_id === 'string' ? { organizationId: claims.org_id } : {}),
    scopes: extractScopes(claims),
    roles: asStringArray(claims.roles),
    entitlements: asStringArray(claims.entitlements),
    ...(extractActor(claims) ? { actor: extractActor(claims) } : {}),
    ...(typeof claims.client_id === 'string' ? { clientId: claims.client_id } : {}),
    via,
    claims,
  };
}

export class TokenVerifier {
  private readonly keySource: JWTVerifyGetKey;

  constructor(private readonly config: ResourceVerifierConfig) {
    this.keySource =
      config.keySource ??
      createRemoteJWKSet(
        new URL(config.jwksUrl ?? `${config.issuer.replace(/\/$/, '')}/.well-known/jwks.json`),
      );
  }

  /**
   * Verify a bearer credential. JWT-shaped tokens are verified locally
   * against the JWKS; anything else goes through introspection when
   * configured. Throws TokenVerificationError on every failure path.
   */
  async verify(token: string): Promise<VerifiedPrincipal> {
    if (isJwtShaped(token)) return this.verifyJwt(token);
    if (this.config.introspection) return this.introspect(token);
    throw new TokenVerificationError(
      'Opaque credential presented but introspection is not configured',
      'unsupported_credential',
    );
  }

  private async verifyJwt(token: string): Promise<VerifiedPrincipal> {
    try {
      const { payload } = await jwtVerify(token, this.keySource, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: this.config.algorithms ?? ['RS256'],
        clockTolerance: this.config.clockToleranceSec ?? 5,
      });
      return principalFromClaims(payload as Record<string, unknown>, 'jwt');
    } catch (err) {
      if (err instanceof TokenVerificationError) throw err;
      throw new TokenVerificationError(
        `JWT verification failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  private async introspect(token: string): Promise<VerifiedPrincipal> {
    const intro = this.config.introspection!;
    const url = intro.url ?? `${this.config.issuer.replace(/\/$/, '')}/v1/oauth/introspect`;
    const doFetch = this.config.fetchFn ?? fetch;

    let payload: Record<string, unknown>;
    try {
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token,
          client_id: intro.clientId,
          client_secret: intro.clientSecret,
        }),
      });
      if (!res.ok) {
        throw new TokenVerificationError(
          `Introspection endpoint returned ${res.status}`,
          'introspection_unavailable',
        );
      }
      payload = (await res.json()) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof TokenVerificationError) throw err;
      throw new TokenVerificationError(
        `Introspection request failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'introspection_unavailable',
      );
    }

    if (payload.active !== true) {
      throw new TokenVerificationError('Credential is not active');
    }
    return principalFromClaims(payload, 'introspected');
  }
}

export function createTokenVerifier(config: ResourceVerifierConfig): TokenVerifier {
  return new TokenVerifier(config);
}
