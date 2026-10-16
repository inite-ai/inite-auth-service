/**
 * OIDC `login_hint` (Core §3.1.2.1) — the address a relying party believes the
 * person will sign in with, typically the email an invite was sent to.
 *
 * It is a prefill for the login/register form and nothing more: it never
 * selects an account, skips a factor, or appears in a token. Anyone can put
 * any address in a URL, so the only thing worth doing with it server-side is
 * keeping junk out of the screen — anything that is not a plausible email
 * address of sane length is dropped (OAuth says to ignore what we don't
 * understand, so a bad hint is never an error).
 */

/** RFC 5321 caps a forward path at 256 octets, i.e. 254 for the address. */
export const LOGIN_HINT_MAX_LENGTH = 254;

// Deliberately loose (one @, a dot in the domain, no whitespace or angle
// brackets): the form re-validates, and the login proves the address anyway.
const EMAIL_ISH = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export function normalizeLoginHint(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const hint = raw.trim();
  if (!hint || hint.length > LOGIN_HINT_MAX_LENGTH) return undefined;
  return EMAIL_ISH.test(hint) ? hint : undefined;
}
