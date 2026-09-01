/**
 * Pending email-change state, as surfaced to the account UI.
 *
 * The change itself is parked in `users.metadata.pendingEmailChange` by
 * IdentityEmailService until the new address is verified. Until this
 * projection existed the UI had no way to know a change was in flight, so
 * the profile kept showing the old address with a "Verified" badge and the
 * user had no way to resend or cancel.
 *
 * The stored `token` is deliberately NOT projected — it is the capability
 * that completes the change and only ever belongs in the emailed link.
 */
export interface PendingEmailChange {
  newEmail: string;
  expiresAt: string;
}

/** Shape written by IdentityEmailService.requestEmailChange(). */
interface StoredPendingEmailChange {
  newEmail?: unknown;
  expires?: unknown;
}

/**
 * Project the metadata blob into the public shape, or null when there is no
 * pending change (or it has already lapsed — an expired request is dead, and
 * showing it as active would just invite the user to wait for an email that
 * can no longer be redeemed).
 */
export function readPendingEmailChange(metadata: unknown): PendingEmailChange | null {
  if (!metadata || typeof metadata !== 'object') return null;

  const pending = (metadata as Record<string, unknown>)['pendingEmailChange'];
  if (!pending || typeof pending !== 'object') return null;

  const { newEmail, expires } = pending as StoredPendingEmailChange;
  if (typeof newEmail !== 'string' || typeof expires !== 'string') return null;

  const expiresAt = new Date(expires);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) return null;

  return { newEmail, expiresAt: expiresAt.toISOString() };
}
