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
import { EmailService } from '../email/email.service';

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

/** RFC 8252 §7.3 — loopback hosts for native/CLI app redirects. */
function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1' || hostname === 'localhost';
}

@Injectable()
export class OAuthService {
  private readonly oauthLogger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly pkceService: PkceService,
    private readonly identityService: IdentityService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Look up a user by id. Lets controllers stay out of the persistence
   * layer (see eslint import/no-restricted-paths).
   */
  async findUserById(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  /** Resolve a user's DID from their id, or null if absent. */
  async getUserDid(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { did: true },
    });
    return user?.did ?? null;
  }

  /**
   * The refresh-token HMAC secret. Falls back to JWT_SECRET only so dev
   * setups don't break, but production MUST set REFRESH_TOKEN_HMAC_SECRET
   * explicitly — using JWT_SECRET means leaking either burns both surfaces.
   */
  private getRefreshTokenSecret(): string {
    const explicit = this.configService.get<string>('REFRESH_TOKEN_HMAC_SECRET');
    if (explicit && explicit.trim().length > 0) return explicit;

    // In production the dedicated secret is mandatory — falling back to
    // JWT_SECRET means a leak of either one burns both surfaces.
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'production') {
      throw new Error(
        'REFRESH_TOKEN_HMAC_SECRET must be set in production (JWT_SECRET fallback is dev-only).',
      );
    }

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

    if (clientSecret) {
      const matchesCurrent = await bcrypt.compare(
        clientSecret,
        client.clientSecretHash,
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
   * Validate OAuth client at the token endpoint.
   *
   * Confidential clients (`isPublic=false`) must present a matching
   * `client_secret`. Public clients (`isPublic=true`, e.g. CLIs and
   * native apps) skip the secret — their authentication is bound to
   * the grant: PKCE for authorization_code, the device_code itself
   * for the device flow. Per RFC 6749 §2.1 + RFC 7636.
   *
   * The grant-specific branches in the controller still enforce their
   * own checks (code_verifier must match the original challenge, the
   * device_code must be approved, etc.) so dropping the secret here
   * doesn't loosen the overall guarantees.
   */
  async validateClientWithSecret(
    clientId: string,
    clientSecret: string,
  ): Promise<OAuthClient> {
    if (!clientSecret) {
      const client = await this.validateClient(clientId);
      if (!client.isPublic) {
        throw new UnauthorizedException('client_secret is required');
      }
      return client;
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
   * Validate redirect URI.
   *
   * Standard rule: exact match against the client's registered list.
   * RFC 8252 §7.3 exception: when both the requested URI and *some*
   * registered URI use a loopback hostname (`127.0.0.1`, `[::1]`,
   * `localhost`), the port is ignored at match time because native /
   * CLI apps bind a random ephemeral port at runtime.
   */
  validateRedirectUri(client: OAuthClient, redirectUri: string): boolean {
    if (client.redirectUris.includes(redirectUri)) return true;

    let requested: URL;
    try {
      requested = new URL(redirectUri);
    } catch {
      return false;
    }
    if (!isLoopbackHost(requested.hostname)) return false;

    return client.redirectUris.some((registered) => {
      try {
        const r = new URL(registered);
        return (
          isLoopbackHost(r.hostname) &&
          r.hostname === requested.hostname &&
          r.protocol === requested.protocol &&
          r.pathname === requested.pathname
        );
      } catch {
        return false;
      }
    });
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
    opts: { acrValues?: string; amr?: string[] } = {},
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

    const tokens = await this.generateTokens(
      authCode.user,
      clientId,
      authCode.scope,
      undefined,
      authCode.nonce ?? undefined,
      {
        amr: authCode.amr ?? [],
        acr: authCode.acrValues ?? undefined,
      },
    );

    // Best-effort: if this is the first successful token exchange
    // between this user and this client, notify the user so they
    // have an audit trail of "what apps did I authorize?" outside
    // the admin panel. We check for any pre-existing (non-revoked)
    // refresh token from before this generateTokens() call — the
    // new one we just minted will be present too, so we exclude it
    // by created_at ordering rather than count.
    this.notifyFirstTimeConsent(authCode.user, clientId, authCode.scope).catch(
      () => {},
    );

    return tokens;
  }

  /**
   * Send the "you authorized this app" email exactly once per
   * (user, client). Skipped when a non-revoked refresh token already
   * existed before this exchange — that means the grant isn't new.
   */
  private async notifyFirstTimeConsent(
    user: User,
    clientId: string,
    scope: string,
  ): Promise<void> {
    try {
      // Count refresh tokens for this user+client created MORE than
      // 5 seconds ago. The one we just minted is younger than that,
      // so a count of 0 means "this was the first issuance".
      const cutoff = new Date(Date.now() - 5000);
      const priorCount = await this.prisma.refreshToken.count({
        where: {
          userId: user.id,
          clientId,
          createdAt: { lt: cutoff },
        },
      });
      if (priorCount > 0) return;

      const client = await this.prisma.oAuthClient.findUnique({
        where: { clientId },
        select: { name: true },
      });
      const scopes = scope ? scope.split(/\s+/).filter(Boolean) : [];
      await this.emailService.sendOAuthConsentGranted(
        { email: user.email, name: user.name ?? undefined },
        client?.name ?? clientId,
        scopes,
      );
    } catch (e: any) {
      this.oauthLogger.warn(
        `first-time-consent notification failed: ${e?.message ?? 'unknown'}`,
      );
    }
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
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    idToken: string;
    expiresIn: number;
    scope: string;
  }> {
    const issuer = this.configService.get<string>('JWT_ISSUER', 'http://localhost:3002');

    const accessTokenExpiry = this.configService.get<string>(
      'JWT_ACCESS_TOKEN_EXPIRY',
      '10m',
    );

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
      },
      {
        expiresIn: accessTokenExpiry as any,
        audience: clientId,
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
      'http://localhost:3002',
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

  getFrontendUrl(): string {
    return this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
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
   * Synchronous cache read for hot paths that can't await — middleware
   * like session-cookie-mode selection or CSP-header rewriting. Returns
   * the most recent snapshot; the cache is refreshed by any concurrent
   * async caller. On a cold start this returns an empty Set, which
   * collapses to "default first-party only" behaviour until the cache
   * warms — fail-safe.
   */
  getAllowedOriginsSync(): Set<string> {
    return this.allowedOriginsCache;
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
