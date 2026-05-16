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
      throw new UnauthorizedException('Invalid client');
    }

    if (clientSecret) {
      const isValid = await bcrypt.compare(clientSecret, client.clientSecretHash);
      if (!isValid) {
        throw new UnauthorizedException('Invalid client credentials');
      }
    }

    return client;
  }

  /**
   * Validate OAuth client with mandatory secret (for token/revoke endpoints)
   */
  async validateClientWithSecret(
    clientId: string,
    clientSecret: string,
  ): Promise<OAuthClient> {
    if (!clientSecret) {
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
   * Create authorization code
   */
  async createAuthorizationCode(
    userId: string,
    clientId: string,
    redirectUri: string,
    scope: string,
    codeChallenge?: string,
    codeChallengeMethod?: string,
  ): Promise<string> {
    const code = crypto.randomBytes(32).toString('base64url');

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await this.prisma.authorizationCode.create({
      data: {
        code,
        userId,
        clientId,
        redirectUri,
        scope,
        codeChallenge,
        codeChallengeMethod,
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

    const idToken = this.jwtService.sign(
      {
        sub: user.did,
        email: user.email,
        email_verified: user.emailVerified,
        name: user.name,
        picture: user.avatarUrl,
        roles: (user.metadata as any)?.roles || ['user'],
      },
      {
        expiresIn: accessTokenExpiry as any,
        audience: clientId,
        issuer,
      },
    );

    const refreshTokenValue = crypto.randomBytes(32).toString('base64url');
    const tokenLookup = hashRefreshToken(
      refreshTokenValue,
      this.getRefreshTokenSecret(),
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        tokenLookup,
        userId: user.id,
        clientId,
        scope,
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
  ): Promise<{
    accessToken: string;
    expiresIn: number;
    scope: string;
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

    const sub = client.companyId ?? client.clientId;
    const accessTokenExpiry = this.configService.get<string>(
      'JWT_ACCESS_TOKEN_EXPIRY',
      '10m',
    );
    const issuer = this.configService.get<string>(
      'JWT_ISSUER',
      'auth.inite.ai',
    );

    const accessToken = this.jwtService.sign(
      {
        sub,
        client_id: client.clientId,
        scopes: grantedScopes,
        scope: grantedScopes.join(' '),
      },
      {
        expiresIn: accessTokenExpiry as any,
        audience: audience ?? client.clientId,
        issuer,
      },
    );

    const expiresIn = this.parseExpiryToSeconds(accessTokenExpiry);
    return {
      accessToken,
      expiresIn,
      scope: grantedScopes.join(' '),
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
