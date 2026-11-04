import type { Prisma } from '@prisma/client';
import type { SettingsService } from '../common/settings/settings.service';
import { durationSeconds } from './token-expiry';

/**
 * Refresh reuse grace (RFC 9700 §4.14.2: a short grace for concurrent
 * requests). Several processes sharing one refresh token (CLI agents, IDE
 * plugins, parallel sessions) refresh at the same moment; one wins the
 * rotation and the others present a token revoked a moment ago. Without a
 * grace that trips theft detection and revokes the whole family, the
 * winner's fresh token included, and every process is signed out.
 *
 * Within the window, a replay by the same client of a token revoked BY
 * ROTATION, whose chain still reaches a live token, gets a sibling pair
 * minted from the presented token. The live tip is left alone, and the
 * sibling is a fresh secret only this caller receives. Outside the window,
 * or when the family was revoked (theft, logout), detection is exactly as
 * before.
 *
 * The grace is bounded per FAMILY, not per presented token: at most
 * GRACE_MAX_SIBLINGS siblings over the family's life, and a sibling or any
 * token rotated from one is never eligible itself. Counted per presented
 * token, a thief holding one stolen token could replay, rotate each
 * sibling and replay again, fanning out into unlimited live sessions.
 */

/** Siblings that may be minted in one rotation family, ever; the next replay is theft. */
export const GRACE_MAX_SIBLINGS = 3;
/** How far down the rotation chain a live tip is looked for. */
export const GRACE_MAX_HOPS = 5;
/** Upper bound on REFRESH_REUSE_GRACE: a concurrency window, not a session extension. */
export const GRACE_MAX_SECONDS = 60;
const DEFAULT_GRACE_SECONDS = 30;

/** Raised inside the issuing transaction to abort it without a token. */
export class RefreshGateRefused extends Error {}

/** Runs inside the transaction that persists a refresh token, before the insert. */
export type RefreshTokenGate = (tx: Prisma.TransactionClient) => Promise<void>;

type RefreshDb = Pick<Prisma.TransactionClient, 'refreshToken'>;

/** The fields of a presented refresh token the grace rule reads. */
export interface GraceCandidate {
  id: string;
  userId: string;
  clientId: string;
  revokedAt: Date | null;
  expiresAt: Date;
  familyId: string | null;
  graceLineage: boolean;
}

/** How a new refresh token joins its family. */
export interface RefreshFamily {
  familyId: string;
  graceMinted: boolean;
  graceLineage: boolean;
}

/** A family's id: its first token's (null familyId = this row is the first). */
export function familyOf(token: Pick<GraceCandidate, 'id' | 'familyId'>): string {
  return token.familyId ?? token.id;
}

/** The child of an ordinary rotation: same family, same lineage. */
export function rotationFamily(token: GraceCandidate): RefreshFamily {
  return { familyId: familyOf(token), graceMinted: false, graceLineage: token.graceLineage };
}

/** A grace sibling: same family, marked so it never earns a grace itself. */
export function siblingFamily(token: GraceCandidate): RefreshFamily {
  return { familyId: familyOf(token), graceMinted: true, graceLineage: true };
}

/** `REFRESH_REUSE_GRACE` in milliseconds, at most GRACE_MAX_SECONDS; 0 turns the grace off. */
export function graceWindowMs(settings: SettingsService): number {
  const raw = settings.value('REFRESH_REUSE_GRACE', `${DEFAULT_GRACE_SECONDS}s`);
  const seconds = durationSeconds(raw) ?? DEFAULT_GRACE_SECONDS;
  return Math.min(seconds, GRACE_MAX_SECONDS) * 1000;
}

/**
 * The presented token may be considered at all: the window is on, the token
 * was revoked no longer ago than the window, it has not expired itself, and
 * it is not a grace sibling or descended from one.
 */
export function withinGrace(token: GraceCandidate, windowMs: number, now: Date): boolean {
  if (windowMs <= 0 || !token.revokedAt || token.graceLineage) return false;
  if (token.expiresAt <= now) return false;
  return now.getTime() - token.revokedAt.getTime() <= windowMs;
}

/**
 * The live tip a grace sibling may be minted beside, or null. The family has
 * fewer than GRACE_MAX_SIBLINGS siblings; the presented token was revoked by
 * rotation (it has a child in its lineage); and following that lineage
 * reaches a live token within GRACE_MAX_HOPS. A lineage that ends in a
 * revoked token without a child is a revoked family: no grace revives it.
 *
 * In the main lineage each token has at most one rotation child (the claim
 * is atomic), so the walk is a single chain. Lookups ride the
 * (userId, clientId, revoked) and (familyId) indexes.
 */
export async function graceTip(
  db: RefreshDb,
  token: GraceCandidate,
  now: Date,
): Promise<string | null> {
  const scope = { userId: token.userId, clientId: token.clientId };
  const siblings = await db.refreshToken.count({
    where: { ...scope, familyId: familyOf(token), graceMinted: true },
  });
  if (siblings >= GRACE_MAX_SIBLINGS) return null;
  let parent = token.id;
  for (let hop = 0; hop < GRACE_MAX_HOPS; hop++) {
    const child = await db.refreshToken.findFirst({
      where: { ...scope, rotatedFrom: parent, graceLineage: false },
      select: { id: true, revoked: true, expiresAt: true },
    });
    if (!child) return null;
    if (!child.revoked) return child.expiresAt > now ? child.id : null;
    parent = child.id;
  }
  return null;
}

/**
 * The normal rotation's claim, inside the transaction that inserts the
 * child: a concurrent rotation of the same token blocks on the row until
 * this one commits, then finds it revoked (count 0) — and by then the child
 * is visible, which is what lets the loser take the grace path.
 */
export function claimRotation(tokenId: string): RefreshTokenGate {
  return async (tx) => {
    const claim = await tx.refreshToken.updateMany({
      where: { id: tokenId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    if (claim.count !== 1) throw new RefreshGateRefused('rotation lost');
  };
}

/**
 * Claims the live tip (a conditional update that takes its row lock), then
 * re-checks the rule. Every grace replay in a family queues on that one row,
 * so the per-family cap holds under concurrency; a family revoke that
 * locked the tip first leaves it revoked, and the grace refuses.
 */
export function graceSiblingGate(
  token: GraceCandidate,
  tipId: string,
  now: Date,
): RefreshTokenGate {
  return async (tx) => {
    const claim = await tx.refreshToken.updateMany({
      where: { id: tipId, revoked: false },
      data: { lastUsedAt: now },
    });
    if (claim.count !== 1) throw new RefreshGateRefused('tip no longer live');
    if ((await graceTip(tx, token, now)) !== tipId) throw new RefreshGateRefused('grace refused');
  };
}
