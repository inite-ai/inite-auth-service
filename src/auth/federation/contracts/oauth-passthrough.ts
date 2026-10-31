/**
 * OAuth-continuation params forwarded through an external sign-in round-trip
 * (social federation, Telegram) so an /authorize flow that bounced through it
 * can resume afterwards.
 */
export const OAUTH_PASSTHROUGH = [
  'client_id',
  'redirect_uri',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
  'response_type',
  'nonce',
  'prompt',
  // A federated login is an interactive login: anything dropped here is
  // dropped for the whole flow. acr_values/resource/authorization_details
  // used to be, so the resumed /authorize lost its step-up requirement and
  // its RFC 8707 audience binding on every social sign-in.
  'acr_values',
  'resource',
  'authorization_details',
  // Display-only hints: the RP's language, and the invitee's email so the
  // /login screen a failed round-trip lands on is still prefilled.
  'ui_locales',
  'login_hint',
] as const;

/** The passthrough subset of a query, strings only. */
export function extractOAuthParams(query: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of OAUTH_PASSTHROUGH) {
    const value = query[key];
    if (typeof value === 'string' && value) out[key] = value;
  }
  return out;
}
