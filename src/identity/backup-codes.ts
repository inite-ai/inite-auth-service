import * as crypto from 'crypto';

/** How many single-use recovery codes a regeneration hands out. */
const BACKUP_CODE_COUNT = 10;

/** Bytes per code — 4 bytes hex-encoded gives an 8-char uppercase code. */
const BACKUP_CODE_BYTES = 4;

/**
 * Mint a fresh set of single-use 2FA recovery codes.
 *
 * Callers are responsible for hashing before storage; the plaintext set is
 * returned exactly once, to be shown to the user and never again.
 */
export function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () =>
    crypto.randomBytes(BACKUP_CODE_BYTES).toString('hex').toUpperCase(),
  );
}

/**
 * How many unused codes remain in `users.metadata.backupCodes`.
 *
 * verify2FA splices a code out of the array as it is redeemed, so the array
 * length is the remaining count. Returns 0 for any shape that is not the
 * expected array — an absent or corrupted blob means no usable codes.
 */
export function countBackupCodes(metadata: unknown): number {
  if (!metadata || typeof metadata !== 'object') return 0;
  const codes = (metadata as Record<string, unknown>)['backupCodes'];
  return Array.isArray(codes) ? codes.length : 0;
}
