/**
 * When /authorize must stop and ask WHICH account, instead of silently
 * minting a code for whoever already holds the browser session.
 *
 * Without this, a person who once signed in as A and then follows an invite
 * sent to B is handed straight back to the app as A: the session wins, the
 * hint is ignored, and nothing on screen says which account was used.
 *
 * The answer travels to the login screen as `account=<reason>`:
 *   - `login`   — OIDC `prompt=login`: the person must authenticate again;
 *                 the screen does not offer to continue on the session.
 *   - `select`  — OIDC `prompt=select_account`, or a `login_hint` that is not
 *                 the session's address: the screen shows who is signed in and
 *                 offers "continue as" or "use another account".
 *
 * It never weakens anything: the outcome is always one more screen, never one
 * fewer. `prompt` is not carried past the login screen, and "continue as"
 * goes on to /consent rather than back through /authorize, so the question is
 * asked once per request.
 */

export type AccountChoice = 'login' | 'select';

/** OIDC Core §3.1.2.1: `prompt` is a space-delimited list. */
function promptValues(prompt: string | undefined): Set<string> {
  return new Set((prompt ?? '').split(/\s+/).filter(Boolean));
}

/** Addresses compared as the login form compares them: trimmed, case-folded. */
function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Whether a request arriving WITH a session must ask before issuing a code.
 * `sessionEmail` is the session user's address (null when it has none, e.g. a
 * wallet-only account — any hint is then a mismatch).
 */
export function accountChoiceFor(input: {
  prompt?: string;
  loginHint?: string;
  sessionEmail: string | null;
}): AccountChoice | null {
  const prompt = promptValues(input.prompt);
  if (prompt.has('login')) return 'login';
  if (prompt.has('select_account')) return 'select';
  if (
    input.loginHint &&
    !(input.sessionEmail && sameAddress(input.loginHint, input.sessionEmail))
  ) {
    return 'select';
  }
  return null;
}
