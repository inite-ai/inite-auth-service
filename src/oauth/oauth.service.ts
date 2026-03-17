import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  OAuthClient,
  AuthorizationCode,
  RefreshToken,
  User,
} from '../database/entities';
import { PkceService } from './pkce.service';
import { IdentityService } from '../identity/identity.service';

@Injectable()
export class OAuthService {
  constructor(
    @InjectRepository(OAuthClient)
    private readonly clientRepository: Repository<OAuthClient>,
    @InjectRepository(AuthorizationCode)
    private readonly authCodeRepository: Repository<AuthorizationCode>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
    const client = await this.clientRepository.findOne({
      where: { clientId, active: true },
      select: [
        'id', 'clientId', 'clientSecretHash', 'name',
        'redirectUris', 'allowedScopes', 'allowedGrants',
        'logoUrl', 'privacyPolicyUrl', 'termsOfServiceUrl',
      ],
    });

    if (!client) {
      throw new UnauthorizedException('Invalid client');
    }

    // Verify client secret when provided
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
   * Validate requested scopes against client's allowedScopes.
   * Returns the intersection (only allowed scopes).
   */
  validateScopes(client: OAuthClient, requestedScope: string): string {
    const requested = this.parseScope(requestedScope);
    if (requested.length === 0) {
      // Default to client's allowed scopes
      return client.allowedScopes.join(' ');
    }
    const allowed = new Set(client.allowedScopes);
    const granted = requested.filter((s) => allowed.has(s));
    if (granted.length === 0) {
      throw new BadRequestException(
        `None of the requested scopes are allowed for this client. Allowed: ${client.allowedScopes.join(', ')}`,
      );
    }
    return granted.join(' ');
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
    allowedScopes: string[];
  }> {
    const client = await this.validateClient(clientId);
    return {
      clientId: client.clientId,
      name: client.name,
      logoUrl: client.logoUrl,
      privacyPolicyUrl: client.privacyPolicyUrl,
      termsOfServiceUrl: client.termsOfServiceUrl,
      allowedScopes: client.allowedScopes,
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
    // Generate authorization code
    const code = crypto.randomBytes(32).toString('base64url');

    // Set expiration (10 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Save authorization code
    const authCode = this.authCodeRepository.create({
      code,
      userId,
      clientId,
      redirectUri,
      scope,
      codeChallenge,
      codeChallengeMethod,
      expiresAt,
      used: false,
    });

    await this.authCodeRepository.save(authCode);

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
    // Find authorization code
    const authCode = await this.authCodeRepository.findOne({
      where: { code, clientId, used: false },
      relations: ['user'],
    });

    if (!authCode) {
      throw new BadRequestException('Invalid or expired authorization code');
    }

    // Check if code is expired
    if (authCode.expiresAt < new Date()) {
      throw new BadRequestException('Authorization code expired');
    }

    // Verify redirect URI matches
    if (authCode.redirectUri !== redirectUri) {
      throw new BadRequestException('Redirect URI mismatch');
    }

    // Mark code as used IMMEDIATELY to prevent race conditions
    authCode.used = true;
    await this.authCodeRepository.save(authCode);

    // Verify PKCE if code challenge was provided
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

    // Generate tokens
    const tokens = await this.generateTokens(
      authCode.user,
      clientId,
      authCode.scope,
    );

    return tokens;
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
    const scopes = this.parseScope(scope);

    // Access Token (short-lived: 10 minutes)
    const accessTokenExpiry = this.configService.get<string>(
      'JWT_ACCESS_TOKEN_EXPIRY',
      '10m',
    );

    // Build access token claims based on granted scopes
    const accessTokenPayload: Record<string, any> = {
      sub: user.did,
      userId: user.id,
      scope,
    };

    if (scopes.includes('email')) {
      accessTokenPayload.email = user.email;
      accessTokenPayload.email_verified = user.emailVerified;
    }
    if (scopes.includes('profile')) {
      accessTokenPayload.name = user.name;
      accessTokenPayload.picture = user.avatarUrl;
      accessTokenPayload.roles = user.metadata?.roles || ['user'];
    }

    const accessToken = this.jwtService.sign(accessTokenPayload, {
      expiresIn: accessTokenExpiry as any,
      audience: clientId,
      issuer,
    });

    // ID Token (OIDC) — claims based on scopes
    const idTokenPayload: Record<string, any> = {
      sub: user.did,
      iat: Math.floor(Date.now() / 1000),
    };

    if (scopes.includes('email')) {
      idTokenPayload.email = user.email;
      idTokenPayload.email_verified = user.emailVerified;
    }
    if (scopes.includes('profile')) {
      idTokenPayload.name = user.name;
      idTokenPayload.picture = user.avatarUrl;
      idTokenPayload.roles = user.metadata?.roles || ['user'];
    }

    const idToken = this.jwtService.sign(idTokenPayload, {
      expiresIn: accessTokenExpiry as any,
      audience: clientId,
      issuer,
    });

    // Refresh Token (long-lived: 7 days)
    const refreshTokenValue = crypto.randomBytes(32).toString('base64url');
    const refreshTokenHash = await bcrypt.hash(refreshTokenValue, 10);

    const refreshTokenExpiry = this.configService.get<string>(
      'JWT_REFRESH_TOKEN_EXPIRY',
      '7d',
    );
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const refreshToken = this.refreshTokenRepository.create({
      tokenHash: refreshTokenHash,
      userId: user.id,
      clientId,
      scope,
      expiresAt,
      revoked: false,
    });

    await this.refreshTokenRepository.save(refreshToken);

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      idToken,
      expiresIn: 600, // 10 minutes in seconds
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
    // Find all non-revoked, non-expired refresh tokens for this client
    const existingTokens = await this.refreshTokenRepository.find({
      where: {
        clientId,
        revoked: false,
        expiresAt: MoreThan(new Date()),
      },
      relations: ['user'],
    });

    // Find matching token by comparing hashes
    let matchedToken: RefreshToken | null = null;
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

    // Check if token is expired
    if (matchedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Revoke old refresh token
    matchedToken.revoked = true;
    matchedToken.revokedAt = new Date();
    await this.refreshTokenRepository.save(matchedToken);

    // Generate new tokens (including new refresh token - rotation)
    const tokens = await this.generateTokens(
      matchedToken.user,
      clientId,
      matchedToken.scope,
    );

    // Update the new refresh token's rotatedFrom field
    const newRefreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    const newToken = await this.refreshTokenRepository.findOne({
      where: { tokenHash: newRefreshTokenHash },
    });

    if (newToken) {
      newToken.rotatedFrom = matchedToken.id;
      await this.refreshTokenRepository.save(newToken);
    }

    return tokens;
  }

  /**
   * Revoke refresh token
   */
  async revokeToken(token: string, clientId: string): Promise<void> {
    const tokens = await this.refreshTokenRepository.find({
      where: { clientId, revoked: false },
    });

    for (const dbToken of tokens) {
      const isMatch = await bcrypt.compare(token, dbToken.tokenHash);
      if (isMatch) {
        dbToken.revoked = true;
        dbToken.revokedAt = new Date();
        await this.refreshTokenRepository.save(dbToken);
        return;
      }
    }

    // Don't throw error if token not found (per OAuth2 spec)
  }

  /**
   * Get user info (OIDC endpoint)
   */
  async getUserInfo(userId: string): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
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

    const client = this.clientRepository.create({
      clientId,
      clientSecretHash,
      name,
      redirectUris,
      allowedScopes,
      allowedGrants: ['authorization_code', 'refresh_token'],
      active: true,
    });

    return await this.clientRepository.save(client);
  }

  /**
   * Parse scope string into entitlements array
   */
  private parseScope(scope: string): string[] {
    if (!scope) return [];
    return scope.split(' ').filter(Boolean);
  }

  /**
   * Cleanup expired codes and tokens
   */
  async cleanupExpired(): Promise<void> {
    const now = new Date();

    // Delete expired authorization codes
    await this.authCodeRepository.delete({
      expiresAt: LessThan(now),
    });

    // Delete expired refresh tokens
    await this.refreshTokenRepository.delete({
      expiresAt: LessThan(now),
    });
  }
}

