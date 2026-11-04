import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { SettingsService } from '../common/settings/settings.service';
import type { OAuthAuditService, AuditEventInput } from '../audit/oauth-audit.service';
import { currentDeviceMetadata } from '../common/device-metadata';
import type { AuthorizationDetail } from './contracts/authorization-detail';
import type { GenerateTokensInput } from './oauth-token-issuer.service';
import type { IssuedTokens } from './token-support';
import { hashRefreshToken } from './refresh-token-secret';
import { deadRefreshToken, refreshBounds, type RefreshBoundClient } from './refresh-bounds';
import {
  claimRotation,
  graceEligible,
  graceSiblingGate,
  graceWindowMs,
  RefreshGateRefused,
  withinGrace,
  type RefreshTokenGate,
} from './refresh-grace';

/** A stored refresh token with its user, as the refresh grant reads it. */
type StoredRefreshToken = Prisma.RefreshTokenGetPayload<{ include: { user: true } }>;

/** What the refresh grant needs from the issuer that owns it. */
export interface RefreshGrantDeps {
  prisma: PrismaService;
  settings: SettingsService;
  secret: () => string;
  /** OAuthTokenIssuerService.generateTokens, with the insert gated. */
  issue: (input: GenerateTokensInput, gate?: RefreshTokenGate) => Promise<IssuedTokens>;
  /** CAEP token-revoked signal after a family revoke. */
  signalRevoked: (did: string | undefined, companyId: string | null) => Promise<void>;
  audit?: OAuthAuditService;
}

/**
 * The refresh_token grant: rotation, theft detection (RFC 6819 §5.2.2.3)
 * and the reuse grace (RFC 9700 §4.14.2, refresh-grace.ts). Split out of
 * OAuthTokenIssuerService to keep both within the size gate; the issuer
 * builds it and remains the one entry point (refreshAccessToken).
 */
export class RefreshGrant {
  // The issuer's log context, which operators already search for theft warnings.
  private readonly logger = new Logger('OAuthTokenIssuerService');

  constructor(private readonly deps: RefreshGrantDeps) {}

  /**
   * - Lookup is O(1) via the unique tokenLookup index (HMAC-SHA256 of the
   *   raw token under the server's secret). Knowing the HMAC value proves
   *   the token was minted by this server, so HMAC match is enough — no
   *   separate verification step needed.
   * - If a token is presented that exists but is already REVOKED, treat
   *   it as theft (the legitimate user already rotated past it) and
   *   revoke the entire refresh-token family for that user+client. This
   *   is RFC 6819 §5.2.2.3 behavior. The one exception is a replay by the
   *   same client within REFRESH_REUSE_GRACE of a rotation whose chain is
   *   still live: it gets a sibling pair instead.
   * - With the client row, held to the authorization_code rule (refresh-bounds.ts).
   */
  async refresh(
    refreshTokenValue: string,
    clientId: string,
    client?: RefreshBoundClient,
  ): Promise<IssuedTokens> {
    const tokenLookup = hashRefreshToken(refreshTokenValue, this.deps.secret());

    const matchedToken = await this.deps.prisma.refreshToken.findUnique({
      where: { tokenLookup },
      include: { user: true },
    });

    // Another client's token is refused before any grace or theft logic.
    if (!matchedToken || matchedToken.clientId !== clientId) {
      throw deadRefreshToken('Invalid refresh token');
    }

    if (matchedToken.revoked) return this.replayed(matchedToken, client);

    if (matchedToken.expiresAt < new Date()) {
      throw deadRefreshToken('Refresh token expired');
    }

    const bounds = refreshBounds(client, matchedToken);

    // Atomically claim this rotation slot, in the transaction that inserts
    // the child — a second concurrent rotate of the same token loses there.
    try {
      return await this.deps.issue(
        this.rotationInput(matchedToken, bounds),
        claimRotation(matchedToken.id),
      );
    } catch (e) {
      if (!(e instanceof RefreshGateRefused)) throw e;
    }
    // Lost an exact race: the winner's child is in the table by now, so the
    // loser is a replay within grace like any other.
    const rotated = await this.deps.prisma.refreshToken.findUnique({
      where: { id: matchedToken.id },
      include: { user: true },
    });
    const sibling = rotated ? await this.graceSibling(rotated, client) : null;
    if (sibling) return sibling;
    throw deadRefreshToken('Refresh token already rotated');
  }

  /** The grant a rotated (or sibling) refresh token carries over. */
  private rotationInput(
    token: StoredRefreshToken,
    bounds: { scope: string; resource: string | undefined },
  ): GenerateTokensInput {
    return {
      user: token.user,
      clientId: token.clientId,
      scope: bounds.scope,
      rotatedFrom: token.id,
      tenant: token.companyId,
      nonce: token.nonce ?? undefined,
      authnContext: { amr: token.amr ?? [] },
      // RFC 8707: a token bound to a resource stays bound after rotation.
      audience: bounds.resource,
      // RFC 9396: carry the grant across rotation.
      authorizationDetails:
        (token.authorizationDetails as AuthorizationDetail[] | null) ?? undefined,
    };
  }

  /** A revoked token presented: a grace sibling, or the theft branch. */
  private async replayed(
    token: StoredRefreshToken,
    client?: RefreshBoundClient,
  ): Promise<IssuedTokens> {
    const sibling = await this.graceSibling(token, client);
    if (sibling) return sibling;

    this.logger.warn(
      `Revoked refresh token replayed — possible theft. Revoking family for user=${token.userId} client=${token.clientId}`,
    );
    await this.deps.prisma.refreshToken.updateMany({
      where: { userId: token.userId, clientId: token.clientId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    await this.auditReuse(token, {
      event: 'token.failed.refresh_reuse',
      success: false,
      errorMessage: 'Refresh token revoked',
    });
    await this.deps.signalRevoked(token.user?.did, token.companyId);
    throw deadRefreshToken('Refresh token revoked');
  }

  /**
   * Mint a sibling pair from a token rotated within REFRESH_REUSE_GRACE, or
   * null when the grace rule does not hold (refresh-grace.ts). The live tip
   * is not touched; the cap is re-checked under a row lock as it is minted.
   */
  private async graceSibling(
    token: StoredRefreshToken,
    client?: RefreshBoundClient,
  ): Promise<IssuedTokens | null> {
    const now = new Date();
    if (!withinGrace(token, graceWindowMs(this.deps.settings), now)) return null;
    if (!(await graceEligible(this.deps.prisma, token, now))) return null;
    const bounds = refreshBounds(client, token);
    let tokens: IssuedTokens;
    try {
      tokens = await this.deps.issue(
        this.rotationInput(token, bounds),
        graceSiblingGate(token, now),
      );
    } catch (e) {
      if (e instanceof RefreshGateRefused) return null;
      throw e;
    }
    const ageMs = now.getTime() - (token.revokedAt?.getTime() ?? now.getTime());
    this.logger.warn(
      `Refresh token replayed within grace (age=${ageMs}ms) — minted sibling for user=${token.userId} client=${token.clientId}`,
    );
    await this.auditReuse(token, {
      event: 'token.refreshed.grace_replay',
      success: true,
      scopes: bounds.scope ? bounds.scope.split(' ') : [],
      metadata: { ageMs },
    });
    return tokens;
  }

  /** Audit a refresh-token replay (ids only — never a token value). */
  private async auditReuse(
    token: StoredRefreshToken,
    entry: Pick<AuditEventInput, 'event' | 'success' | 'errorMessage' | 'scopes' | 'metadata'>,
  ): Promise<void> {
    await this.deps.audit?.record({
      ...entry,
      clientId: token.clientId,
      companyId: token.companyId,
      sub: token.user?.did ?? null,
      ...currentDeviceMetadata(),
      metadata: { ...entry.metadata, refreshTokenId: token.id },
    });
  }
}
