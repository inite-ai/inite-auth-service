import type { Prisma } from '@prisma/client';
import type { SettingsService } from '../common/settings/settings.service';
import { FieldCrypto } from '../common/field-crypto';
import type { IssuedTokens } from './token-support';
import { durationSeconds } from './token-expiry';

/**
 * Refresh reuse grace (RFC 9700 §4.14.2: a short grace for concurrent
 * requests; the reuse-interval pattern of Auth0 and Okta). Several processes
 * sharing one refresh token (CLI agents, IDE plugins, parallel sessions)
 * refresh at the same moment; one wins the rotation and the others present a
 * token revoked a moment ago. Without a grace that trips theft detection and
 * revokes the whole family, the winner's fresh token included.
 *
 * Within the window, a replay by the same client of a token revoked by
 * rotation gets back the SAME pair the rotation returned, as long as that
 * child is still live. One chain only: nothing new is minted, so no replay,
 * however many, adds a session. To hand the pair back, the rotated row keeps
 * it encrypted (FieldCrypto, FIELD_ENCRYPTION_KEY) for the window and no
 * longer. Without the key nothing is kept and the grace is off.
 */

/** Upper bound on REFRESH_REUSE_GRACE: a concurrency window, not a session extension. */
export const GRACE_MAX_SECONDS = 60;
const DEFAULT_GRACE_SECONDS = 30;

/** Raised inside the issuing transaction to abort it without a token. */
export class RefreshGateRefused extends Error {}

/**
 * Runs inside the transaction that persists a refresh token, before the
 * insert, with the pair about to be returned.
 */
export type RefreshTokenGate = (
  tx: Prisma.TransactionClient,
  issued: IssuedTokens,
) => Promise<void>;

/** The fields of a presented refresh token the grace rule reads. */
export interface GraceCandidate {
  id: string;
  revokedAt: Date | null;
  expiresAt: Date;
  graceReplay: string | null;
  graceReplayUntil: Date | null;
}

/** `REFRESH_REUSE_GRACE` in milliseconds, at most GRACE_MAX_SECONDS; 0 turns the grace off. */
export function graceWindowMs(settings: SettingsService): number {
  const raw = settings.value('REFRESH_REUSE_GRACE', `${DEFAULT_GRACE_SECONDS}s`);
  const seconds = durationSeconds(raw) ?? DEFAULT_GRACE_SECONDS;
  return Math.min(seconds, GRACE_MAX_SECONDS) * 1000;
}

/**
 * The presented token may be considered at all: the window is on, it was
 * revoked no longer ago than the window, and it has not expired itself.
 */
export function withinGrace(token: GraceCandidate, windowMs: number, now: Date): boolean {
  if (windowMs <= 0 || !token.revokedAt || token.expiresAt <= now) return false;
  return now.getTime() - token.revokedAt.getTime() <= windowMs;
}

/** What the rotated row keeps: the pair, bound to that row, and when it was issued. */
interface SealedPair extends IssuedTokens {
  parentId: string;
  issuedAt: number;
}

/**
 * The columns that keep a rotation's pair on the rotated row for the window.
 * Empty when the grace is off or there is no encryption key: never plaintext.
 */
export function sealReplay(
  fieldCrypto: FieldCrypto | undefined,
  windowMs: number,
): (parentId: string, issued: IssuedTokens) => Prisma.RefreshTokenUpdateManyMutationInput {
  return (parentId, issued) => {
    if (!fieldCrypto || windowMs <= 0) return {};
    const now = Date.now();
    const sealed: SealedPair = { ...issued, parentId, issuedAt: now };
    try {
      return {
        graceReplay: fieldCrypto.encrypt(JSON.stringify(sealed)),
        graceReplayUntil: new Date(now + windowMs),
      };
    } catch {
      return {}; // FIELD_ENCRYPTION_KEY unset: keep nothing, so no grace
    }
  };
}

/**
 * The pair a rotation returned, if the window has not passed and it opens
 * under our key for this very row; `expires_in` is what is left of the
 * access token's life. Null otherwise (a plaintext or foreign value is never
 * returned).
 */
export function openReplay(
  fieldCrypto: FieldCrypto | undefined,
  token: GraceCandidate,
  now: Date,
): IssuedTokens | null {
  const blob = token.graceReplay;
  if (!fieldCrypto || !blob || !token.graceReplayUntil || token.graceReplayUntil <= now)
    return null;
  if (!FieldCrypto.isEncrypted(blob)) return null;
  let sealed: SealedPair;
  try {
    sealed = JSON.parse(fieldCrypto.decrypt(blob)) as SealedPair;
  } catch {
    return null;
  }
  if (sealed.parentId !== token.id) return null;
  const elapsed = Math.floor((now.getTime() - sealed.issuedAt) / 1000);
  const { accessToken, refreshToken, idToken, scope } = sealed;
  return {
    accessToken,
    refreshToken,
    idToken,
    scope,
    expiresIn: Math.max(0, sealed.expiresIn - elapsed),
  };
}

/** The columns that erase a kept pair. */
export const ERASED_REPLAY = { graceReplay: null, graceReplayUntil: null } as const;

/**
 * The rows holding a kept pair within a revoke's scope. A pair sits on the
 * ROTATED (already revoked) row, so a revoke's own `revoked: false` filter
 * never reaches it: every revoke runs a second updateMany over this scope,
 * setting ERASED_REPLAY, so no kept pair outlives a revoke.
 */
export function keptPairsIn(scope: Prisma.RefreshTokenWhereInput): Prisma.RefreshTokenWhereInput {
  return { ...scope, graceReplay: { not: null } };
}

/**
 * A single token's revoke (RFC 7009, one session): the pair a token's
 * rotation kept (on the token itself) and the pair kept for it (on its parent).
 */
export function keptPairsAround(token: { id: string; rotatedFrom: string | null }) {
  const ids = token.rotatedFrom ? [token.id, token.rotatedFrom] : [token.id];
  return keptPairsIn({ id: { in: ids } });
}

/** Can a pair be kept at all: an encryption instance with its key. */
export function canKeepPairs(fieldCrypto: FieldCrypto | undefined): boolean {
  return !!fieldCrypto && Object.keys(sealReplay(fieldCrypto, 1)('probe', PROBE)).length > 0;
}

/** One line for the boot log: is the grace on, and why not. */
export function describeGrace(settings: SettingsService, fieldCrypto?: FieldCrypto): string {
  const windowMs = graceWindowMs(settings);
  if (windowMs <= 0) return 'Refresh reuse grace: off (REFRESH_REUSE_GRACE=0)';
  if (!canKeepPairs(fieldCrypto)) {
    return 'Refresh reuse grace: off (FIELD_ENCRYPTION_KEY not set, nothing can be kept)';
  }
  return `Refresh reuse grace: on (${windowMs / 1000}s; the rotation's pair is kept AES-256-GCM encrypted for the window)`;
}
const PROBE: IssuedTokens = {
  accessToken: '',
  refreshToken: '',
  idToken: '',
  expiresIn: 0,
  scope: '',
};

/** Erase every kept pair whose window has passed (the hourly cleanup). */
export async function eraseExpiredReplays(
  db: Pick<Prisma.TransactionClient, 'refreshToken'>,
  now: Date,
): Promise<number> {
  const { count } = await db.refreshToken.updateMany({
    where: { graceReplayUntil: { lt: now } },
    data: ERASED_REPLAY,
  });
  return count;
}

/**
 * The rotation's claim, inside the transaction that inserts the child: a
 * concurrent rotation of the same token blocks on the row until this one
 * commits, then finds it revoked (count 0), and by then the kept pair and
 * the child are visible, which is what lets the loser get the same pair. A
 * family revoke that got there first leaves the row revoked: the claim fails.
 */
export function claimRotation(
  token: { id: string; rotatedFrom: string | null },
  seal: ReturnType<typeof sealReplay>,
): RefreshTokenGate {
  return async (tx, issued) => {
    const claim = await tx.refreshToken.updateMany({
      where: { id: token.id, revoked: false },
      data: { revoked: true, revokedAt: new Date(), ...seal(token.id, issued) },
    });
    if (claim.count !== 1) throw new RefreshGateRefused('rotation lost');
    // This token was the child a kept pair on its parent hands back; once it
    // rotates, that pair can never be returned again (the child is not live).
    if (token.rotatedFrom) {
      await tx.refreshToken.updateMany({
        where: keptPairsIn({ id: token.rotatedFrom }),
        data: ERASED_REPLAY,
      });
    }
  };
}
