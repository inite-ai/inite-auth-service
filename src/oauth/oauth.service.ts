import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { OAuthClient, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PkceService } from './pkce.service';
import { IdentityService } from '../identity/identity.service';

/**
 * Compute the deterministic lookup hash for a refresh token.
 * Uses HMAC-SHA256 with a server-side secret, so:
 *   - Lookup is O(1) via a unique index (was O(N) bcrypt-scan).
 *   - DB read alone cannot forge a token (still requires the HMAC secret).
 *   - The HMAC value is BOTH the lookup key AND the verification — match
 *     means the token was minted by this server.
 */
function hashRefreshToken(token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(token).digest('base64url');
}

/**
 * Pre-computed bcrypt hash of a static random string. Used as a
 * timing-equaliser target when validateClient finds no client row —
 * we still pay one bcrypt.compare so the no-client path takes the
 * same wall time as the wrong-secret path. Stops timing-channel
 * enumeration of valid client_ids.
 */
const TIMING_DUMMY_HASH =
  '$2a$10$CwTycUXWue0Thq9StjUM0u..wfBpO5SQEihKK5xrxAGl0F3PaMtsm';

/**
 * Scopes a DCR-registered public client (RFC 7591) is allowed to
 * request — both at registration time and on subsequent /authorize
 * calls. The list intentionally omits anything that grants privileged
 * access: a DCR caller is by construction anonymous-on-the-internet
 * and must not be able to escalate by asking for, e.g., `brain:admin`.
 *
 * Confidential clients (admin-provisioned via /v1/admin/oauth-clients)
 * are unaffected — their allowedScopes are set explicitly by an
 * operator and may include anything.
 */
const DCR_SCOPE_ALLOWLIST = new Set([
  'openid',
  'profile',
  'email',
  'offline_access',
  'mcp:audit',
]);

/**
 * Redirect-URI policy for RFC 7591 public clients (OAuth 2.1 §4.1.3,
 * RFC 8252 §7):
 *   - https://*                                — fine
 *   - http://127.0.0.1[:port], http://[::1][:port]  — loopback, fine
 *                                                 (native CLI tools
 *                                                 spin up a local
 *                                                 callback server)
 *   - non-http(s) custom schemes               — fine (RFC 8252 §7.1
 *                                                 private-use URI
 *                                                 scheme; OS enforces
 *                                                 single-app
 *                                                 ownership)
 *   - http://* off-loopback                    — REJECTED. Plain HTTP
 *                                                 to a third-party
 *                                                 host would leak
 *                                                 codes in flight.
 *
 * `localhost` is intentionally NOT accepted — DNS for "localhost" can
 * be hijacked on shared networks; OAuth 2.1 §4.1.3 requires the
 * literal IP form.
 */
function isAcceptablePublicRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol === 'http:') {
    // URL stores IPv6 hostnames with surrounding brackets.
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    return host === '127.0.0.1' || host === '::1';
  }
  // Any non-http(s) scheme is treated as an RFC 8252 §7.1 private-use
  // URI scheme. Scheme ownership lives on the OS — we can't validate
  // it from here, and the spec does not require us to.
  return parsed.protocol !== '';
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly pkceService: PkceService,
    private readonly identityService: IdentityService,
  ) {}

  /**
   * The refresh-token HMAC secret. Falls back to JWT_SECRET only so dev
   * setups don't break, but production MUST set REFRESH_TOKEN_HMAC_SECRET
   * explicitly — using JWT_SECRET means leaking either burns both surfaces.
   */
  private getRefreshTokenSecret(): string {
    const explicit = this.configService.get<string>('REFRESH_TOKEN_HMAC_SECRET');
    if (explicit && explicit.trim().length > 0) return explicit;
    const fallback = this.configService.get<string>('JWT_SECRET');
    if (!fallback) {
      throw new Error(
        'REFRESH_TOKEN_HMAC_SECRET (or JWT_SECRET fallback) must be set',
      );
    }
    return fallback;
  }

  /**
   * Validate OAuth client (no secret required — for authorize endpoint)
   */
  async validateClient(clientId: string): Promise<OAuthClient>;
  /**
   * Validate OAuth client with secret (required — for token endpoint)
   */
  async validateClient(clientId: string, clientSecret: string): Promise<OAuthClient>;
  async validateClient(
    clientId: string,
    clientSecret?: string,
  ): Promise<OAuthClient> {
    const client = await this.prisma.oAuthClient.findFirst({
      where: { clientId, active: true },
    });

    if (!client) {
      // Pay one bcrypt round even on the no-client path so an
      // attacker can't distinguish "client unknown" from "wrong
      // secret" via response timing. Use a fixed dummy hash so the
      // CPU cost is constant regardless of input.
      if (clientSecret) {
        await bcrypt.compare(clientSecret, TIMING_DUMMY_HASH);
      }
      throw new UnauthorizedException('Invalid client');
    }

    // Public clients (RFC 7591 token_endpoint_auth_method=none) carry
    // no secret. Reject if a secret is presented — and pay the bcrypt
    // cost on the rejection path so the timing channel can't tell
    // "public client" from "wrong secret". The success path skips
    // bcrypt entirely (no secret to compare); the resulting fast-path
    // leaks only the fact that a clientId is public, which is harmless
    // because public clients have no secret to brute-force.
    if (client.tokenEndpointAuthMethod === 'none') {
      if (clientSecret) {
        await bcrypt.compare(clientSecret, TIMING_DUMMY_HASH);
        throw new UnauthorizedException(
          'Public clients must not present client_secret',
        );
      }
      return client;
    }

    if (clientSecret) {
      // Confidential client path. clientSecretHash is NOT NULL by
      // construction here (the schema makes it nullable only to
      // accommodate public clients, which we already returned above).
      // Coerce for the type-checker — null would mean a data-integrity
      // bug and bcrypt.compare would safely reject either way.
      const matchesCurrent = await bcrypt.compare(
        clientSecret,
        client.clientSecretHash ?? TIMING_DUMMY_HASH,
      );

      // Grace-period acceptance: during a rotation window, the prior
      // secret is still honoured until previousSecretExpiresAt. Run
      // the compare unconditionally when the column is present so an
      // attacker can't time-distinguish "current matched" from
      // "previous matched".
      let matchesPrevious = false;
      const previousHash = client.previousSecretHash;
      const previousExp = client.previousSecretExpiresAt;
      if (previousHash && previousExp && previousExp > new Date()) {
        matchesPrevious = await bcrypt.compare(clientSecret, previousHash);
      } else if (previousHash) {
        // Expired but still in column — pay the bcrypt cost to keep
        // timing constant, then ignore the result.
        await bcrypt.compare(clientSecret, previousHash);
      }

      if (!matchesCurrent && !matchesPrevious) {
        throw new UnauthorizedException('Invalid client credentials');
      }
    }

    return client;
  }

  /**
   * Validate OAuth client at token/revoke/introspect entry points.
   *
   * Confidential clients (token_endpoint_auth_method=client_secret_post)
   * MUST present a non-empty client_secret. Public clients
   * (token_endpoint_auth_method=none, DCR-registered) MUST NOT — PKCE
   * is their authentication. We peek at the auth method before
   * enforcing presence so public clients aren't rejected for the
   * thing that makes them public.
   *
   * The dummy bcrypt on the "missing secret + confidential" path
   * keeps the response time aligned with the wrong-secret path —
   * timing alone cannot tell an attacker whether they fed a
   * confidential clientId without a secret or a confidential clientId
   * with the wrong secret.
   */
  async validateClientWithSecret(
    clientId: string,
    clientSecret: string,
  ): Promise<OAuthClient> {
    const probe = await this.prisma.oAuthClient.findFirst({
      where: { clientId, active: true },
      select: { tokenEndpointAuthMethod: true },
    });
    const isPublic = probe?.tokenEndpointAuthMethod === 'none';

    if (!isPublic && !clientSecret) {
      await bcrypt.compare('', TIMING_DUMMY_HASH);
      throw new UnauthorizedException('client_secret is required');
    }
    return this.validateClient(clientId, clientSecret);
  }

  /**
   * Normalize scope
   */
  normalizeScope(requestedScope: string): string {
    const scopes = this.parseScope(requestedScope);
    return scopes.length > 0 ? scopes.join(' ') : 'openid profile email';
  }

  /**
   * Validate that the client supports the requested grant type
   */
  validateGrantType(client: OAuthClient, grantType: string): void {
    if (!client.allowedGrants || !client.allowedGrants.includes(grantType)) {
      throw new BadRequestException(
        `Grant type "${grantType}" is not allowed for this client`,
      );
    }
  }

  /**
   * Get public client info (for consent page)
   */
  async getClientInfo(clientId: string): Promise<{
    clientId: string;
    name: string;
    logoUrl?: string;
    privacyPolicyUrl?: string;
    termsOfServiceUrl?: string;
  }> {
    const client = await this.validateClient(clientId);
    return {
      clientId: client.clientId,
      name: client.name,
      logoUrl: client.logoUrl,
      privacyPolicyUrl: client.privacyPolicyUrl,
      termsOfServiceUrl: client.termsOfServiceUrl,
    };
  }

  /**
   * Validate redirect URI
   */
  validateRedirectUri(client: OAuthClient, redirectUri: string): boolean {
    return client.redirectUris.includes(redirectUri);
  }

  /**
   * RFC 8707 resource-indicator validation.
   *
   * Accepts the resource param as it comes off Express (`undefined`,
   * a single string, or — if repeated in the query — an array) and:
   *   - returns `undefined` when none requested (legacy aud=clientId
   *     path);
   *   - throws if more than one resource is asked for (we don't yet
   *     support multi-resource tokens; the spec allows but doesn't
   *     require it);
   *   - throws if the requested resource isn't in `client.allowedResources`;
   *   - returns the single resource string otherwise.
   *
   * The strict allowlist matters: without it, a stolen authorization
   * code from app-A could be exchanged for a token aud-bound to
   * resource-B, bypassing the whole point of RFC 8707.
   */
  validateResource(
    client: OAuthClient,
    resource: string | string[] | undefined,
  ): string | undefined {
    if (resource === undefined || resource === null) return undefined;
    const arr = Array.isArray(resource) ? resource : [resource];
    const cleaned = arr.map((s) => (s ?? '').trim()).filter(Boolean);
    if (cleaned.length === 0) return undefined;
    if (cleaned.length > 1) {
      throw new BadRequestException(
        'Only one resource indicator is supported per request',
      );
    }
    const r = cleaned[0];
    const allowed = client.allowedResources ?? [];
    if (!allowed.includes(r)) {
      throw new BadRequestException(
        `Resource "${r}" is not allowed for this client`,
      );
    }
    return r;
  }

  /**
   * Create authorization code.
   *
   * `nonce` is the OIDC nonce parameter (core §3.1.2.1) and gets
   * round-tripped into the id_token claims at /token. We store it
   * verbatim — the spec leaves length+format to the RP — and only
   * embed it when present, so legacy OAuth2-only clients don't get
   * an unexpected claim.
   */
  async createAuthorizationCode(
    userId: string,
    clientId: string,
    redirectUri: string,
    scope: string,
    codeChallenge?: string,
    codeChallengeMethod?: string,
    nonce?: string,
    opts: { acrValues?: string; amr?: string[]; resource?: string } = {},
  ): Promise<string> {
    const code = crypto.randomBytes(32).toString('base64url');

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Resolve companyId from the client row so the auth-code row
    // carries the tenant scope. A separate query keeps this cheap
    // even when the caller already validated the client elsewhere.
    const clientRow = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
      select: { companyId: true },
    });

    await this.prisma.authorizationCode.create({
      data: {
        code,
        userId,
        clientId,
        companyId: clientRow?.companyId ?? null,
        redirectUri,
        scope,
        codeChallenge,
        codeChallengeMethod,
        nonce: nonce ?? null,
        acrValues: opts.acrValues ?? null,
        amr: opts.amr ?? [],
        // RFC 8707 — captured at /authorize, round-tripped into the
        // access token's aud claim when the code is exchanged. Null
        // when the client did not request resource binding.
        resource: opts.resource ?? null,
        expiresAt,
        used: false,
      },
    });

    return code;
  }

  /**
   * Exchange authorization code for tokens.
   *
   * Atomicity: the code is claimed via a single UPDATE WHERE used=false
   * (Postgres' atomic single-row update guarantees only one concurrent
   * request wins). Two parallel /token requests with the same code can no
   * longer both pass the used-check — exactly one succeeds.
   *
   * Code-replay defense: if the claim fails because the code was already
   * used, treat it as theft and revoke the entire refresh-token family
   * issued from that code's user+client (RFC 6819 §4.4.1.1).
   */
  async exchangeAuthorizationCode(
    code: string,
    clientId: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    idToken: string;
    expiresIn: number;
    scope: string;
  }> {
    const claim = await this.prisma.authorizationCode.updateMany({
      where: {
        code,
        clientId,
        redirectUri,
        used: false,
        expiresAt: { gt: new Date() },
      },
      data: { used: true },
    });

    if (claim.count !== 1) {
      const replay = await this.prisma.authorizationCode.findUnique({
        where: { code },
      });
      if (replay && replay.used) {
        this.logger.warn(
          `Authorization code replay detected — revoking refresh-token family for user=${replay.userId} client=${replay.clientId}`,
        );
        await this.prisma.refreshToken.updateMany({
          where: { userId: replay.userId, clientId: replay.clientId, revoked: false },
          data: { revoked: true, revokedAt: new Date() },
        });
      }
      throw new BadRequestException('Invalid or expired authorization code');
    }

    const authCode = await this.prisma.authorizationCode.findUnique({
      where: { code },
      include: { user: true },
    });
    if (!authCode) {
      // Should never happen — we just claimed this row.
      throw new BadRequestException('Authorization code not found after claim');
    }

    if (authCode.codeChallenge) {
      if (!codeVerifier) {
        throw new BadRequestException('Code verifier required');
      }

      const isValid = this.pkceService.verifyCodeChallenge(
        codeVerifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod || 'S256',
      );

      if (!isValid) {
        throw new BadRequestException('Invalid code verifier');
      }
    }

    return await this.generateTokens(
      authCode.user,
      clientId,
      authCode.scope,
      undefined,
      authCode.nonce ?? undefined,
      {
        amr: authCode.amr ?? [],
        acr: authCode.acrValues ?? undefined,
      },
      authCode.resource ?? undefined,
    );
  }

  /**
   * Generate access token, refresh token, and ID token.
   *
   * `rotatedFrom`, when present, is the id of the previous refresh token
   * in the rotation chain. Setting it on creation (rather than via a
   * second updateMany after) is what fixes the previous silent-corruption
   * bug — bcrypt's salted hash made the post-create lookup never match.
   */
  async generateTokens(
    user: User,
    clientId: string,
    scope: string,
    rotatedFrom?: string,
    nonce?: string,
    authnContext: { amr?: string[]; acr?: string } = {},
    resource?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    idToken: string;
    expiresIn: number;
    scope: string;
  }> {
    const issuer = this.configService.get<string>('JWT_ISSUER', 'auth.inite.ai');

    const accessTokenExpiry = this.configService.get<string>(
      'JWT_ACCESS_TOKEN_EXPIRY',
      '10m',
    );

    // RFC 8707: when the auth flow carried a `resource` indicator, the
    // access token is bound to that resource server via its `aud`
    // claim. Without a resource, we fall back to the clientId (legacy
    // behaviour) so existing apps that don't speak RFC 8707 keep
    // working. The id_token's `aud` stays clientId regardless — per
    // OIDC core §2 it identifies the relying party, not the API.
    const accessTokenAudience = resource ?? clientId;

    const accessToken = this.jwtService.sign(
      {
        sub: user.did,
        userId: user.id,
        email: user.email,
        email_verified: user.emailVerified,
        name: user.name,
        picture: user.avatarUrl,
        roles: (user.metadata as any)?.roles || ['user'],
        scope,
        // Echo the client back into the access token. With resource
        // binding the `aud` now identifies the resource server, so
        // downstream RS code that needs to know which client minted
        // this token (e.g. for per-client rate limiting) reads it
        // from `client_id` instead.
        client_id: clientId,
      },
      {
        expiresIn: accessTokenExpiry as any,
        audience: accessTokenAudience,
        issuer,
      },
    );

    // nonce goes ONLY into the id_token per OIDC core §2 — access_token
    // does not carry it because RPs validate nonces on the id_token side.
    const idTokenClaims: Record<string, any> = {
      sub: user.did,
      email: user.email,
      email_verified: user.emailVerified,
      name: user.name,
      picture: user.avatarUrl,
      roles: (user.metadata as any)?.roles || ['user'],
    };
    if (nonce) idTokenClaims.nonce = nonce;
    // amr is RFC 8176 — list of methods that authenticated the user
    // for this session. acr is a coarser bucket the RP can compare
    // against acr_values_supported. Both ride the id_token only.
    if (authnContext.amr && authnContext.amr.length > 0) {
      idTokenClaims.amr = authnContext.amr;
    }
    if (authnContext.acr) idTokenClaims.acr = authnContext.acr;

    const idToken = this.jwtService.sign(idTokenClaims, {
      expiresIn: accessTokenExpiry as any,
      audience: clientId,
      issuer,
    });

    const refreshTokenValue = crypto.randomBytes(32).toString('base64url');
    const tokenLookup = hashRefreshToken(
      refreshTokenValue,
      this.getRefreshTokenSecret(),
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Tenant scope is stamped on the refresh token at issue-time so
    // admin reads can filter by companyId without joining oauth_clients
    // (and survive a client delete).
    const clientRow = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
      select: { companyId: true },
    });

    await this.prisma.refreshToken.create({
      data: {
        tokenLookup,
        userId: user.id,
        clientId,
        companyId: clientRow?.companyId ?? null,
        scope,
        nonce: nonce ?? null,
        amr: authnContext.amr ?? [],
        // Carry the resource indicator forward across rotation so the
        // refresh-issued access token keeps the original aud binding.
        resource: resource ?? null,
        expiresAt,
        revoked: false,
        rotatedFrom: rotatedFrom ?? null,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      idToken,
      expiresIn: 600,
      scope,
    };
  }

  /**
   * Refresh access token using refresh token (with rotation + theft
   * detection).
   *
   * - Lookup is O(1) via the unique tokenLookup index (HMAC-SHA256 of the
   *   raw token under the server's secret). Knowing the HMAC value proves
   *   the token was minted by this server, so HMAC match is enough — no
   *   separate verification step needed.
   * - If a token is presented that exists but is already REVOKED, treat
   *   it as theft (the legitimate user already rotated past it) and
   *   revoke the entire refresh-token family for that user+client. This
   *   is RFC 6819 §5.2.2.3 behavior.
   */
  async refreshAccessToken(
    refreshTokenValue: string,
    clientId: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    idToken: string;
    expiresIn: number;
    scope: string;
  }> {
    const tokenLookup = hashRefreshToken(
      refreshTokenValue,
      this.getRefreshTokenSecret(),
    );

    const matchedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenLookup },
      include: { user: true },
    });

    if (!matchedToken || matchedToken.clientId !== clientId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (matchedToken.revoked) {
      this.logger.warn(
        `Revoked refresh token replayed — possible theft. Revoking family for user=${matchedToken.userId} client=${matchedToken.clientId}`,
      );
      await this.prisma.refreshToken.updateMany({
        where: {
          userId: matchedToken.userId,
          clientId: matchedToken.clientId,
          revoked: false,
        },
        data: { revoked: true, revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token revoked');
    }

    if (matchedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Atomically claim this rotation slot — second concurrent rotate of
    // the same token loses the race and gets count=0 here.
    const claim = await this.prisma.refreshToken.updateMany({
      where: { id: matchedToken.id, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    if (claim.count !== 1) {
      throw new UnauthorizedException('Refresh token already rotated');
    }

    return this.generateTokens(
      matchedToken.user,
      clientId,
      matchedToken.scope ?? '',
      matchedToken.id,
      matchedToken.nonce ?? undefined,
      { amr: matchedToken.amr ?? [] },
      matchedToken.resource ?? undefined,
    );
  }

  /**
   * Issue a machine-to-machine access token via the
   * client_credentials grant (RFC 6749 §4.4). No user identity is
   * involved — the token's `sub` claim is the client's `companyId`
   * (or its `clientId` when companyId is not set), so downstream
   * services like brain key data per-tenant.
   *
   * Scopes are filtered against the client's `allowedScopes`: a
   * client cannot request brain:admin if it wasn't provisioned for
   * it. An empty request defaults to ALL the client's allowed scopes
   * — common pattern for service-to-service callers who don't want
   * to repeat the full scope list per request.
   *
   * Audience is honoured if the client passed one; otherwise the
   * token has no aud claim (caller's loss — they'd be rejected by
   * any service that audience-validates).
   *
   * The token is JWT-signed by the same JWKS the rest of the service
   * uses. Refresh tokens are NOT issued — client_credentials is
   * stateless by RFC; the caller re-fetches when the access token
   * nears expiry (see @inite/auth/machineToken for the SDK helper).
   */
  async issueClientCredentialsToken(
    client: OAuthClient,
    requestedScope: string | undefined,
    audience: string | undefined,
    dpopJkt?: string,
  ): Promise<{
    accessToken: string;
    expiresIn: number;
    scope: string;
    audience: string;
    tokenType: 'Bearer' | 'DPoP';
  }> {
    const requested = (requestedScope ?? '').split(/\s+/).filter(Boolean);
    const allowed = client.allowedScopes ?? [];
    const grantedScopes =
      requested.length === 0
        ? allowed.slice()
        : requested.filter((s) => allowed.includes(s));

    if (requested.length > 0 && grantedScopes.length !== requested.length) {
      const denied = requested.filter((s) => !allowed.includes(s));
      throw new BadRequestException(
        `Scope(s) not allowed for this client: ${denied.join(', ')}`,
      );
    }

    if (grantedScopes.length === 0) {
      throw new BadRequestException(
        'No scopes available for this client_credentials grant',
      );
    }

    // Audience binding — when the client has an explicit
    // allowedAudiences list, any requested audience must be in it.
    // Empty allow-list falls back to the legacy behaviour of using
    // clientId as the audience.
    const allowedAud = client.allowedAudiences ?? [];
    let effectiveAudience: string;
    if (audience) {
      if (allowedAud.length > 0 && !allowedAud.includes(audience)) {
        throw new BadRequestException(
          `Audience "${audience}" is not allowed for this client`,
        );
      }
      effectiveAudience = audience;
    } else if (allowedAud.length > 0) {
      effectiveAudience = allowedAud[0];
    } else {
      effectiveAudience = client.clientId;
    }

    const sub = client.companyId ?? client.clientId;
    // M2M tokens use a shorter TTL than user-flow tokens so a
    // deactivated machine client stops working within ≤5min — our
    // chosen revocation strategy in place of a real-time revocation
    // list. Override via JWT_M2M_ACCESS_TOKEN_EXPIRY.
    const accessTokenExpiry = this.configService.get<string>(
      'JWT_M2M_ACCESS_TOKEN_EXPIRY',
      '5m',
    );
    const issuer = this.configService.get<string>(
      'JWT_ISSUER',
      'auth.inite.ai',
    );

    const claims: Record<string, any> = {
      sub,
      client_id: client.clientId,
      scopes: grantedScopes,
      scope: grantedScopes.join(' '),
    };
    if (dpopJkt) {
      // RFC 9449 §6.1: bind the access token to the client's DPoP
      // key by SHA-256 thumbprint. Resource servers verify it
      // matches the proof they receive on the protected request.
      claims.cnf = { jkt: dpopJkt };
    }

    const accessToken = this.jwtService.sign(claims, {
      expiresIn: accessTokenExpiry as any,
      audience: effectiveAudience,
      issuer,
    });

    const expiresIn = this.parseExpiryToSeconds(accessTokenExpiry);
    return {
      accessToken,
      expiresIn,
      scope: grantedScopes.join(' '),
      audience: effectiveAudience,
      tokenType: dpopJkt ? 'DPoP' : 'Bearer',
    };
  }

  /**
   * Translate the expressive JWT expiry string ('10m', '1h', '3600s')
   * into seconds for the OAuth token-response `expires_in` field.
   * RFC 6749 §5.1 requires this as a number.
   */
  private parseExpiryToSeconds(expiry: string): number {
    const m = /^(\d+)([smhd]?)$/.exec(expiry.trim());
    if (!m) return 600;
    const value = parseInt(m[1], 10);
    switch (m[2]) {
      case 's':
      case '':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return value;
    }
  }

  /**
   * Revoke refresh token (RFC 7009).
   * O(1) lookup via tokenLookup. Silently no-ops if the token is unknown,
   * already revoked, or for a different client — per spec.
   */
  async revokeToken(token: string, clientId: string): Promise<void> {
    const tokenLookup = hashRefreshToken(token, this.getRefreshTokenSecret());
    await this.prisma.refreshToken.updateMany({
      where: { tokenLookup, clientId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
  }

  /**
   * Get user info (OIDC endpoint)
   */
  async getUserInfo(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const wallets = await this.identityService.getWallets(userId);

    return {
      sub: user.did,
      email: user.email,
      email_verified: user.emailVerified,
      name: user.name,
      picture: user.avatarUrl,
      did: user.did,
      wallets: wallets.map((w) => ({
        address: w.address,
        chain: w.chain,
      })),
    };
  }

  /**
   * Register OAuth client
   */
  async registerClient(
    clientId: string,
    clientSecret: string,
    name: string,
    redirectUris: string[],
    allowedScopes: string[] = ['openid', 'profile', 'email'],
  ): Promise<OAuthClient> {
    const clientSecretHash = await bcrypt.hash(clientSecret, 10);

    return await this.prisma.oAuthClient.create({
      data: {
        clientId,
        clientSecretHash,
        name,
        redirectUris,
        allowedScopes,
        allowedGrants: ['authorization_code', 'refresh_token'],
        active: true,
      },
    });
  }

  /**
   * RFC 7591 Dynamic Client Registration — public clients only.
   *
   * Issues a brand new clientId and persists a row with
   * `tokenEndpointAuthMethod=none` and no clientSecretHash. The MCP
   * authorization spec expects this endpoint so native callers
   * (Claude Code et al.) can self-register without an admin
   * pre-provisioning them.
   *
   * Confidential clients still flow through /v1/admin/oauth-clients —
   * DCR on this server is narrow on purpose.
   *
   * Security envelope:
   *   - scope is intersected with DCR_SCOPE_ALLOWLIST; a DCR caller
   *     cannot grant itself, e.g., `brain:admin`
   *   - allowedResources is seeded from the server-wide
   *     `DCR_DEFAULT_RESOURCES` env var (comma-separated) so the
   *     operator controls which downstream resource servers DCR
   *     clients may target. Unset → tokens fall back to aud=clientId
   *     (no resource binding)
   *   - redirect_uris policy enforced via isAcceptablePublicRedirectUri
   *   - rate limiting is the controller's responsibility (see the
   *     @Throttle decorator on /v1/oauth/register)
   */
  async registerPublicClient(input: {
    redirectUris: string[];
    scope?: string;
    clientName?: string;
    logoUri?: string;
    policyUri?: string;
    tosUri?: string;
    grantTypes?: string[];
  }): Promise<{
    client_id: string;
    client_id_issued_at: number;
    redirect_uris: string[];
    token_endpoint_auth_method: 'none';
    grant_types: string[];
    response_types: ['code'];
    scope: string;
    client_name?: string;
    logo_uri?: string;
    policy_uri?: string;
    tos_uri?: string;
  }> {
    if (!input.redirectUris || input.redirectUris.length === 0) {
      throw new BadRequestException('redirect_uris is required');
    }
    for (const uri of input.redirectUris) {
      if (!isAcceptablePublicRedirectUri(uri)) {
        throw new BadRequestException(
          `redirect_uri "${uri}" is not acceptable for a public client ` +
            '(use https, http://127.0.0.1, http://[::1], or a private-use URI scheme)',
        );
      }
    }

    const requestedScopes = (input.scope ?? '').split(/\s+/).filter(Boolean);
    const grantedScopes =
      requestedScopes.length === 0
        ? ['mcp:audit']
        : requestedScopes.filter((s) => DCR_SCOPE_ALLOWLIST.has(s));
    if (requestedScopes.length > 0 && grantedScopes.length !== requestedScopes.length) {
      const denied = requestedScopes.filter((s) => !DCR_SCOPE_ALLOWLIST.has(s));
      throw new BadRequestException(
        `Scope(s) not allowed for DCR registration: ${denied.join(', ')}`,
      );
    }

    const dcrDefaultResources = (
      this.configService.get<string>('DCR_DEFAULT_RESOURCES', '') ?? ''
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const allowedGrants =
      input.grantTypes && input.grantTypes.length > 0
        ? input.grantTypes
        : ['authorization_code', 'refresh_token'];

    // `dcr_` prefix lets admin queries filter self-registered clients
    // with a single LIKE without an extra column or join.
    const clientId = `dcr_${crypto.randomBytes(16).toString('hex')}`;

    const created = await this.prisma.oAuthClient.create({
      data: {
        clientId,
        clientSecretHash: null,
        tokenEndpointAuthMethod: 'none',
        name: input.clientName ?? 'Public Client (DCR)',
        redirectUris: input.redirectUris,
        allowedScopes: grantedScopes,
        allowedGrants,
        allowedResources: dcrDefaultResources,
        allowedAudiences: [],
        active: true,
        logoUrl: input.logoUri ?? null,
        privacyPolicyUrl: input.policyUri ?? null,
        termsOfServiceUrl: input.tosUri ?? null,
      },
    });

    // RFC 7591 §3.2.1 response shape — wire field names use snake_case
    // verbatim from the spec so generic OAuth/DCR libraries on the
    // client side can parse it without remapping.
    const response: any = {
      client_id: created.clientId,
      client_id_issued_at: Math.floor(created.createdAt.getTime() / 1000),
      redirect_uris: created.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: created.allowedGrants,
      response_types: ['code'],
      scope: created.allowedScopes.join(' '),
    };
    if (created.name) response.client_name = created.name;
    if (created.logoUrl) response.logo_uri = created.logoUrl;
    if (created.privacyPolicyUrl) response.policy_uri = created.privacyPolicyUrl;
    if (created.termsOfServiceUrl) response.tos_uri = created.termsOfServiceUrl;
    return response;
  }

  getFrontendUrl(): string {
    return this.configService.get<string>('FRONTEND_URL', 'https://auth.inite.ai');
  }

  // Cache for allowed origins
  private allowedOriginsCache = new Set<string>();
  private allowedOriginsCacheTime = 0;

  /**
   * Load all allowed origins from DB + config. Cached for 60s.
   */
  async getAllowedOrigins(): Promise<Set<string>> {
    const now = Date.now();
    if (now - this.allowedOriginsCacheTime < 60_000 && this.allowedOriginsCache.size > 0) {
      return this.allowedOriginsCache;
    }

    const origins = new Set<string>();

    const frontendUrl = this.configService.get<string>('FRONTEND_URL', '');
    if (frontendUrl) origins.add(frontendUrl.replace(/\/$/, ''));

    const extra = this.configService.get<string>('CORS_ORIGINS', '');
    for (const o of extra.split(',').filter(Boolean)) {
      origins.add(o.replace(/\/$/, ''));
    }

    const clients = await this.prisma.oAuthClient.findMany({ where: { active: true } });
    for (const client of clients) {
      for (const uri of client.redirectUris) {
        try { origins.add(new URL(uri).origin); } catch {}
      }
    }

    this.allowedOriginsCache = origins;
    this.allowedOriginsCacheTime = now;
    return origins;
  }

  /**
   * Check if an origin is allowed
   */
  async isAllowedOrigin(origin: string): Promise<boolean> {
    const allowed = await this.getAllowedOrigins();
    return allowed.has(origin);
  }

  /**
   * Parse scope string into entitlements array
   */
  private parseScope(scope: string): string[] {
    if (!scope) return [];
    return scope.split(' ').filter(Boolean);
  }

  private readonly logger = new Logger(OAuthService.name);

  /**
   * Cleanup expired codes and tokens — runs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpired(): Promise<void> {
    this.logger.log('Cleaning up expired tokens and codes...');
    const now = new Date();

    await this.prisma.authorizationCode.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    if (count) {
      this.logger.log(`Deleted ${count} expired refresh tokens`);
    }
  }
}
