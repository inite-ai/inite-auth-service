import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { SettingsService } from '../common/settings/settings.service';
import type { OAuthAuditService, AuditEventInput } from '../audit/oauth-audit.service';
import type { FieldCrypto } from '../common/field-crypto';
import { currentDeviceMetadata } from '../common/device-metadata';
import type { AuthorizationDetail } from './contracts/authorization-detail';
import type { GenerateTokensInput } from './oauth-token-issuer.service';
import type { IssuedTokens } from './token-support';
import { hashRefreshToken } from './refresh-token-secret';
import { deadRefreshToken, refreshBounds, type RefreshBoundClient } from './refresh-bounds';
import {
  claimRotation,
  ERASED_REPLAY,
  graceWindowMs,
  openReplay,
  RefreshGateRefused,
  sealReplay,
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
  /** Keeps a rotation's pair encrypted for the grace window; without it the grace is off. */
  fieldCrypto?: FieldCrypto;
}

/** What a replay within the grace window comes to. */
type GraceOutcome =
  | { kind: 'pair'; tokens: IssuedTokens }
  /** The child was itself rotated since: refused, nothing revoked. */
  | { kind: 'rotated' }
  /** No kept pair, or the child was revoked: the path outside the grace. */
  | { kind: 'none' };

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
   *   same client within REFRESH_REUSE_GRACE of the rotation: it gets the
   *   same pair the rotation returned, while that child is still live.
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

    if (matchedToken.revoked) return this.replayed(matchedToken);

    if (matchedToken.expiresAt < new Date()) {
      throw deadRefreshToken('Refresh token expired');
    }

    const bounds = refreshBounds(client, matchedToken);

    // Atomically claim this rotation slot, in the transaction that inserts
    // the child and keeps the pair — a second concurrent rotate of the same
    // token loses there.
    const seal = sealReplay(this.deps.fieldCrypto, graceWindowMs(this.deps.settings));
    try {
      return await this.deps.issue(
        this.rotationInput(matchedToken, bounds),
        claimRotation(matchedToken.id, seal),
      );
    } catch (e) {
      if (!(e instanceof RefreshGateRefused)) throw e;
    }
    // Lost an exact race: the winner's pair is kept by now, so the loser
    // gets it like any replay within the grace — or "already rotated", as before.
    const rotated = await this.deps.prisma.refreshToken.findUnique({
      where: { id: matchedToken.id },
      include: { user: true },
    });
    const outcome = rotated ? await this.graceReuse(rotated) : { kind: 'none' as const };
    if (outcome.kind === 'pair') return outcome.tokens;
    throw deadRefreshToken('Refresh token already rotated');
  }

  /** The grant a rotated refresh token carries over. */
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

  /** A revoked token presented: the kept pair, a plain refusal, or the theft branch. */
  private async replayed(token: StoredRefreshToken): Promise<IssuedTokens> {
    const outcome = await this.graceReuse(token);
    if (outcome.kind === 'pair') return outcome.tokens;
    if (outcome.kind === 'rotated') {
      this.logger.warn(
        `Refresh token replayed within grace after its child was rotated — refused, nothing revoked, for user=${token.userId} client=${token.clientId}`,
      );
      throw deadRefreshToken('Refresh token already rotated');
    }

    this.logger.warn(
      `Revoked refresh token replayed — possible theft. Revoking family for user=${token.userId} client=${token.clientId}`,
    );
    const where = { userId: token.userId, clientId: token.clientId };
    await this.deps.prisma.refreshToken.updateMany({
      where: { ...where, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    // No kept pair outlives a theft verdict; this is also where a pair read
    // after its window is erased (the hourly cleanup catches the rest).
    await this.deps.prisma.refreshToken.updateMany({
      where: { ...where, graceReplay: { not: null } },
      data: ERASED_REPLAY,
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
   * Within REFRESH_REUSE_GRACE of the rotation, the pair the rotation
   * returned — only while its child is still live. The child is checked
   * with a conditional update, so a family revoke that committed first wins.
   */
  private async graceReuse(token: StoredRefreshToken): Promise<GraceOutcome> {
    const now = new Date();
    if (!withinGrace(token, graceWindowMs(this.deps.settings), now)) return { kind: 'none' };
    const tokens = openReplay(this.deps.fieldCrypto, token, now);
    if (!tokens) return { kind: 'none' };
    const scope = { userId: token.userId, clientId: token.clientId };
    const child = await this.deps.prisma.refreshToken.findFirst({
      where: { ...scope, rotatedFrom: token.id },
      select: { id: true },
    });
    if (!child) return { kind: 'none' };
    const live = await this.deps.prisma.refreshToken.updateMany({
      where: { id: child.id, revoked: false, expiresAt: { gt: now } },
      data: { lastUsedAt: now },
    });
    if (live.count !== 1) {
      const grandchild = await this.deps.prisma.refreshToken.count({
        where: { ...scope, rotatedFrom: child.id },
      });
      return grandchild > 0 ? { kind: 'rotated' } : { kind: 'none' };
    }
    const ageMs = now.getTime() - (token.revokedAt?.getTime() ?? now.getTime());
    this.logger.warn(
      `Refresh token replayed within grace (age=${ageMs}ms) — returned the rotation's pair for user=${token.userId} client=${token.clientId}`,
    );
    await this.auditReuse(token, {
      event: 'token.refreshed.grace_reuse',
      success: true,
      scopes: tokens.scope ? tokens.scope.split(' ') : [],
      metadata: { ageMs, childRefreshTokenId: child.id },
    });
    return { kind: 'pair', tokens };
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
