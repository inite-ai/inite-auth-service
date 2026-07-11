import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Optional } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SsfEmitterService } from '../ssf/ssf-emitter.service';
import { AuthorizationDetail } from './contracts/authorization-detail';
import { CAEP_EVENTS } from '../ssf/caep-event-types';
import { SettingsService } from '../common/settings/settings.service';

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
  /**
   * RFC 9396 authorization_details granted for this token. Emitted as an
   * access-token claim and persisted on the refresh token so rotation keeps
   * the same grant.
   */
  authorizationDetails?: AuthorizationDetail[];
}

/** Issuer + access-token expiry resolved once per token issuance. */
interface SigningContext {
  issuer: string;
  accessTokenExpiry: string;
}

/** Resolved org/role context for token claims (union of relational RBAC + legacy metadata.roles). */
interface OrgContext {
  roles: string[];
  org?: string;
  orgId?: string;
}

@Injectable()
export class OAuthTokenIssuerService {
  private readonly logger = new Logger(OAuthTokenIssuerService.name);

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly settings: SettingsService,
    @Optional() private readonly ssf?: SsfEmitterService,
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
    const orgCtx = await this.resolveOrgContext(input);

    const accessToken = this.buildAccessToken(input, sctx, orgCtx);
    const idToken = this.buildIdToken(input, sctx, orgCtx);

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
      accessTokenExpiry: this.settings.value('JWT_ACCESS_TOKEN_EXPIRY', '10m'),
    };
  }

  private buildAccessToken(
    input: GenerateTokensInput,
    sctx: SigningContext,
    orgCtx: OrgContext,
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
        roles: orgCtx.roles,
        ...(orgCtx.org ? { org: orgCtx.org, org_id: orgCtx.orgId } : {}),
        // RFC 9396: echo the granted authorization_details into the access token.
        ...(input.authorizationDetails?.length
          ? { authorization_details: input.authorizationDetails }
          : {}),
        scope,
      },
      {
        expiresIn: sctx.accessTokenExpiry as JwtSignOptions['expiresIn'],
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
    orgCtx: OrgContext,
  ): string {
    const { user, clientId, nonce } = input;
    const authnContext = input.authnContext ?? {};
    // nonce goes ONLY into the id_token per OIDC core §2 — access_token
    // does not carry it because RPs validate nonces on the id_token side.
    const idTokenClaims: Record<string, unknown> = {
      sub: user.did,
      email: user.email,
      email_verified: user.emailVerified,
      name: user.name,
      picture: user.avatarUrl,
      roles: orgCtx.roles,
      ...(orgCtx.org ? { org: orgCtx.org, org_id: orgCtx.orgId } : {}),
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
      expiresIn: sctx.accessTokenExpiry as JwtSignOptions['expiresIn'],
      audience: clientId,
      issuer: sctx.issuer,
    });
  }

  /**
   * Resolve the roles + org context to stamp on issued tokens. Backward
   * compatible: by default (RBAC_TOKEN_CLAIMS_ENABLED unset) it returns just
   * the legacy metadata.roles so existing consumers are unchanged. When
   * enabled, roles become the UNION of metadata.roles and the user's active
   * membership roles, and org/org_id claims are added for the org matching the
   * client's tenant (companyId) — falling back to the user's first membership.
   */
  private async resolveOrgContext(input: GenerateTokensInput): Promise<OrgContext> {
    const metadata = input.user.metadata as { roles?: string[] } | null;
    const metaRoles: string[] = metadata?.roles ?? [];
    const legacy = { roles: metaRoles.length ? metaRoles : ['user'] };
    if (!this.settings.flag('RBAC_TOKEN_CLAIMS_ENABLED')) {
      return legacy;
    }

    const memberships = await this.prisma.membership.findMany({
      where: { userId: input.user.id, status: 'active' },
      include: { organization: true },
    });
    if (memberships.length === 0) return legacy;

    const clientRow = await this.prisma.oAuthClient.findUnique({
      where: { clientId: input.clientId },
      select: { companyId: true },
    });
    const chosen =
      memberships.find((m) => m.organization.companyId === clientRow?.companyId)
      ?? memberships[0]!; // memberships is non-empty (checked above)
    const roles = [...new Set([...metaRoles, ...memberships.map((m) => m.role)])];
    return {
      roles: roles.length ? roles : ['user'],
      org: chosen.organization.companyId,
      orgId: chosen.organizationId,
    };
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
        // RFC 9396: persist the grant so rotation re-emits the same details.
        authorizationDetails: input.authorizationDetails?.length
          ? (input.authorizationDetails as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
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
      await this.signalTokenRevoked(matchedToken.user?.did, matchedToken.companyId);
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
      // RFC 9396: carry the grant across rotation.
      authorizationDetails:
        (matchedToken.authorizationDetails as AuthorizationDetail[] | null) ?? undefined,
    });
  }

  /**
   * Revoke refresh token (RFC 7009).
   * O(1) lookup via tokenLookup. Silently no-ops if the token is unknown,
   * already revoked, or for a different client — per spec.
   */
  async revokeToken(token: string, clientId: string): Promise<void> {
    const tokenLookup = hashRefreshToken(token, this.getRefreshTokenSecret());
    const row = await this.prisma.refreshToken.findFirst({
      where: { tokenLookup, clientId },
      select: { companyId: true, user: { select: { did: true } } },
    });
    await this.prisma.refreshToken.updateMany({
      where: { tokenLookup, clientId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    if (row) await this.signalTokenRevoked(row.user?.did, row.companyId);
  }

  /**
   * CAEP token-claims-change (token-revoked) signal (fire-and-forget) so
   * subscribed receivers can drop the revoked token. No-op without SSF.
   */
  private async signalTokenRevoked(did: string | undefined, companyId: string | null): Promise<void> {
    if (!this.ssf || !did) return;
    await this.ssf.emit({
      eventType: CAEP_EVENTS.tokenClaimsChange,
      subject: did,
      companyId,
    });
  }
}
