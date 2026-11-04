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
 * or when the family was revoked (theft, /oauth/revoke, logout), detection
 * is exactly as before.
 */

/** Siblings that may be minted from one rotated token; the next replay is theft. */
export const GRACE_MAX_SIBLINGS = 3;
/** How far down the rotation chain a live tip is looked for. */
export const GRACE_MAX_HOPS = 5;
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
}

/** `REFRESH_REUSE_GRACE` in milliseconds; 0 turns the grace off. */
export function graceWindowMs(settings: SettingsService): number {
  const raw = settings.value('REFRESH_REUSE_GRACE', `${DEFAULT_GRACE_SECONDS}s`);
  return (durationSeconds(raw) ?? DEFAULT_GRACE_SECONDS) * 1000;
}

/** Revoked no longer ago than the window (and the window is on). */
export function withinGrace(token: GraceCandidate, windowMs: number, now: Date): boolean {
  if (windowMs <= 0 || !token.revokedAt) return false;
  return now.getTime() - token.revokedAt.getTime() <= windowMs;
}

/**
 * The token was revoked by rotation (it has a child), fewer than
 * GRACE_MAX_SIBLINGS siblings were minted from it, and its chain reaches a
 * live token within GRACE_MAX_HOPS. A chain that ends in revoked tokens
 * without children is a revoked family: no grace revives it.
 *
 * Child lookups filter on (userId, clientId, rotatedFrom), which rides the
 * existing (userId, clientId, revoked) index.
 */
export async function graceEligible(
  db: RefreshDb,
  token: GraceCandidate,
  now: Date,
): Promise<boolean> {
  const where = { userId: token.userId, clientId: token.clientId };
  let frontier = [token.id];
  for (let hop = 0; hop < GRACE_MAX_HOPS && frontier.length > 0; hop++) {
    const children = await db.refreshToken.findMany({
      where: { ...where, rotatedFrom: { in: frontier } },
      select: { id: true, revoked: true, expiresAt: true },
    });
    // One child is the rotation itself; the rest are grace siblings.
    if (hop === 0 && (children.length === 0 || children.length > GRACE_MAX_SIBLINGS)) {
      return false;
    }
    if (children.some((c) => !c.revoked && c.expiresAt > now)) return true;
    frontier = children.filter((c) => c.revoked).map((c) => c.id);
  }
  return false;
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
 * Re-checks the grace rule under a row lock on the presented token, so
 * concurrent replays are serialised and the sibling cap holds: each one
 * counts the siblings the previous ones committed.
 */
export function graceSiblingGate(token: GraceCandidate, now: Date): RefreshTokenGate {
  return async (tx) => {
    await tx.refreshToken.updateMany({ where: { id: token.id }, data: { lastUsedAt: now } });
    if (!(await graceEligible(tx, token, now))) throw new RefreshGateRefused('grace refused');
  };
}
