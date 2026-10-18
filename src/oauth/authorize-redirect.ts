import { Request } from 'express';
import { ResolvedAuthorizeParams } from './dto/oauth-requests';
import { AccountChoice } from './account-choice';

/**
 * The redirect from /authorize to the login or consent screen of the SPA,
 * with every param the resumed flow needs. Kept apart from the controller so
 * the one list of carried params sits next to the one function that uses it.
 */

/**
 * Every /authorize param that must survive the hop through the login or
 * consent screen, as [query key, ResolvedAuthorizeParams key].
 *
 * One list on purpose. These used to be nine inline `if` statements, and
 * `resource` (RFC 8707) was simply never added to them — so a resource
 * indicator was dropped the moment a flow showed a login screen, and the
 * issued token fell back to `aud: <client_id>`. The same omission had
 * already swallowed `authorization_details` (RFC 9396), which the consent
 * screen renders. `authorize-param-passthrough.spec.ts` fails if a new
 * ResolvedAuthorizeParams field is neither listed here nor explicitly
 * excluded, so the next param cannot go missing the same way.
 *
 * Not carried, deliberately: `responseType` (the resumed /authorize always
 * asks for `code`) and `prompt` (replaying `prompt=none` after an
 * interactive login would bounce the user straight back out).
 */
const CARRIED_AUTHORIZE_PARAMS: ReadonlyArray<readonly [string, keyof ResolvedAuthorizeParams]> = [
  ['client_id', 'clientId'],
  ['redirect_uri', 'redirectUri'],
  ['scope', 'scope'],
  ['state', 'state'],
  ['code_challenge', 'codeChallenge'],
  ['code_challenge_method', 'codeChallengeMethod'],
  ['nonce', 'nonce'],
  // acr_values so the resumed /authorize re-checks the assurance requirement.
  ['acr_values', 'acrValues'],
  // RFC 8707 — without this the access token's audience defaults to client_id.
  ['resource', 'resource'],
  // RFC 9396 — the consent screen itemizes these before the user approves.
  ['authorization_details', 'authorizationDetails'],
  // OIDC ui_locales — the login screen opens in the RP's language.
  ['ui_locales', 'uiLocales'],
  // OIDC login_hint — prefills the email field (an invite's address). The
  // SPA treats it as a suggestion only; the login itself proves identity.
  ['login_hint', 'loginHint'],
];

/** Build a /login or /consent redirect carrying the OAuth params forward. */
export function buildClientRedirect(
  req: Request,
  path: string,
  ctx: { params: ResolvedAuthorizeParams; stepUp?: boolean; accountChoice?: AccountChoice },
): string {
  const p = ctx.params;
  const url = new URL(path, process.env.FRONTEND_URL || `https://${req.headers.host}`);
  for (const [queryKey, paramKey] of CARRIED_AUTHORIZE_PARAMS) {
    const value = p[paramKey];
    if (value) url.searchParams.set(queryKey, value);
  }
  // step_up is a hint to the SPA (force a fresh, stronger factor), not an
  // inbound /authorize param — hence it sits outside the carried list.
  if (ctx.stepUp) url.searchParams.set('step_up', '1');
  // Same kind of hint: which account question to put (account-choice.ts).
  if (ctx.accountChoice) url.searchParams.set('account', ctx.accountChoice);
  return url.toString();
}
