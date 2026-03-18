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
   * Exchange authorization code for tokens
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
    const authCode = await this.prisma.authorizationCode.findFirst({
      where: { code, clientId, used: false },
      include: { user: true },
    });

    if (!authCode) {
      throw new BadRequestException('Invalid or expired authorization code');
    }

    if (authCode.expiresAt < new Date()) {
      throw new BadRequestException('Authorization code expired');
    }

    if (authCode.redirectUri !== redirectUri) {
      throw new BadRequestException('Redirect URI mismatch');
    }

    // Mark code as used IMMEDIATELY to prevent race conditions
    await this.prisma.authorizationCode.update({
      where: { id: authCode.id },
      data: { used: true },
    });

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
   * Generate access token, refresh token, and ID token
   */
  async generateTokens(
    user: User,
    clientId: string,
    scope: string,
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
    const refreshTokenHash = await bcrypt.hash(refreshTokenValue, 10);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: refreshTokenHash,
        userId: user.id,
        clientId,
        scope,
        expiresAt,
        revoked: false,
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
   * Refresh access token using refresh token (with rotation)
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
    const existingTokens = await this.prisma.refreshToken.findMany({
      where: {
        clientId,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    let matchedToken: (typeof existingTokens)[0] | null = null;
    for (const token of existingTokens) {
      const isMatch = await bcrypt.compare(refreshTokenValue, token.tokenHash);
      if (isMatch) {
        matchedToken = token;
        break;
      }
    }

    if (!matchedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (matchedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    await this.prisma.refreshToken.update({
      where: { id: matchedToken.id },
      data: { revoked: true, revokedAt: new Date() },
    });

    const tokens = await this.generateTokens(
      matchedToken.user,
      clientId,
      matchedToken.scope,
    );

    // Update the new refresh token's rotatedFrom field
    const newRefreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: newRefreshTokenHash },
      data: { rotatedFrom: matchedToken.id },
    });

    return tokens;
  }

  /**
   * Revoke refresh token
   */
  async revokeToken(token: string, clientId: string): Promise<void> {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { clientId, revoked: false },
    });

    for (const dbToken of tokens) {
      const isMatch = await bcrypt.compare(token, dbToken.tokenHash);
      if (isMatch) {
        await this.prisma.refreshToken.update({
          where: { id: dbToken.id },
          data: { revoked: true, revokedAt: new Date() },
        });
        return;
      }
    }
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
