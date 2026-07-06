import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

export interface GenerateTokensInput {
  user: User;
  clientId: string;
  scope: string;
  rotatedFrom?: string;
  nonce?: string;
  authnContext?: { amr?: string[]; acr?: string };
  /**
   * RFC 8707 resource-bound audience for the ACCESS token. When set, the
   * access token's `aud` becomes this value instead of the clientId. The
   * id_token `aud` is NOT affected — it stays the clientId per OIDC core.
   */
  audience?: string;
}

/** Issuer + access-token expiry resolved once per token issuance. */
interface SigningContext {
  issuer: string;
  accessTokenExpiry: string;
}

@Injectable()
export class OAuthTokenIssuerService {
  private readonly logger = new Logger(OAuthTokenIssuerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

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
   * Generate access token, refresh token, and ID token.
   *
   * `rotatedFrom`, when present, is the id of the previous refresh token
   * in the rotation chain. Setting it on creation (rather than via a
   * second updateMany after) is what fixes the previous silent-corruption
   * bug — bcrypt's salted hash made the post-create lookup never match.
   */
  async generateTokens(input: GenerateTokensInput): Promise<{
    accessToken: string;
    refreshToken: string;
    idToken: string;
    expiresIn: number;
    scope: string;
  }> {
    const sctx = this.signingContext();

    const accessToken = this.buildAccessToken(input, sctx);
    const idToken = this.buildIdToken(input, sctx);

    const refreshTokenValue = crypto.randomBytes(32).toString('base64url');
    await this.persistRefreshToken(input, refreshTokenValue);

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      idToken,
      expiresIn: 600,
      scope: input.scope,
    };
  }

  private signingContext(): SigningContext {
    return {
      issuer: this.configService.get<string>('JWT_ISSUER', 'http://localhost:3002'),
      accessTokenExpiry: this.configService.get<string>(
        'JWT_ACCESS_TOKEN_EXPIRY',
        '10m',
      ),
    };
  }

  private buildAccessToken(
    input: GenerateTokensInput,
    sctx: SigningContext,
  ): string {
    const { user, clientId, scope } = input;
    return this.jwtService.sign(
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
        expiresIn: sctx.accessTokenExpiry as any,
        // RFC 8707: bind the access-token audience to the requested
        // resource when present; otherwise default to the clientId.
        audience: input.audience ?? clientId,
        issuer: sctx.issuer,
      },
    );
  }

  private buildIdToken(
    input: GenerateTokensInput,
    sctx: SigningContext,
  ): string {
    const { user, clientId, nonce } = input;
    const authnContext = input.authnContext ?? {};
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

    return this.jwtService.sign(idTokenClaims, {
      expiresIn: sctx.accessTokenExpiry as any,
      audience: clientId,
      issuer: sctx.issuer,
    });
  }

  private async persistRefreshToken(
    input: GenerateTokensInput,
    refreshTokenValue: string,
  ): Promise<void> {
    const { user, clientId, scope, nonce, rotatedFrom } = input;
    const authnContext = input.authnContext ?? {};
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

    return this.generateTokens({
      user: matchedToken.user,
      clientId,
      scope: matchedToken.scope ?? '',
      rotatedFrom: matchedToken.id,
      nonce: matchedToken.nonce ?? undefined,
      authnContext: { amr: matchedToken.amr ?? [] },
    });
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
}
