import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
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
   * Validate OAuth client
   */
  async validateClient(
    clientId: string,
    clientSecret?: string,
  ): Promise<OAuthClient> {
    const client = await this.clientRepository.findOne({
      where: { clientId, active: true },
      select: ['id', 'clientId', 'clientSecretHash', 'name', 'redirectUris', 'allowedScopes', 'allowedGrants'],
    });

    if (!client) {
      throw new UnauthorizedException('Invalid client');
    }

    // If client secret is provided, verify it
    if (clientSecret) {
      const isValid = await bcrypt.compare(clientSecret, client.clientSecretHash);
      if (!isValid) {
        throw new UnauthorizedException('Invalid client credentials');
      }
    }

    return client;
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

    // Mark code as used
    authCode.used = true;
    await this.authCodeRepository.save(authCode);

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
  }> {
    const issuer = this.configService.get<string>('JWT_ISSUER', 'auth.inite.ai');

    // Get user's wallets
    const wallets = await this.identityService.getWallets(user.id);

    // Access Token (short-lived: 10 minutes)
    const accessTokenExpiry = this.configService.get<string>(
      'JWT_ACCESS_TOKEN_EXPIRY',
      '10m',
    );

    const accessToken = this.jwtService.sign(
      {
        sub: user.did,
        email: user.email,
        email_verified: user.emailVerified,
        name: user.name,
        picture: user.avatarUrl,
        wallets: wallets.map((w) => w.address),
        roles: user.metadata?.roles || ['user'],
        entitlements: this.parseScope(scope),
      },
      {
        expiresIn: accessTokenExpiry as any,
        audience: clientId,
        issuer,
      },
    );

    // ID Token (OIDC)
    const idToken = this.jwtService.sign(
      {
        sub: user.did,
        email: user.email,
        email_verified: user.emailVerified,
        name: user.name,
        picture: user.avatarUrl,
        roles: user.metadata?.roles || ['user'],
        iat: Math.floor(Date.now() / 1000),
      },
      {
        expiresIn: accessTokenExpiry as any,
        audience: clientId,
        issuer,
      },
    );

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
  }> {
    // Find all non-revoked refresh tokens for this client
    const existingTokens = await this.refreshTokenRepository.find({
      where: {
        clientId,
        revoked: false,
        expiresAt: LessThan(new Date()),
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

