/**
 * The /authorize continuation stashed on a magic link or a password-reset
 * token and handed back to the SPA as `oauth_params`, so the flow can resume after an out-of-band login.
 *
 * Must stay in step with MagicLinkOAuthParamsDto (what the wire accepts) and
 * with the frontend's OAuthParams: a field missing here is a param that gets
 * silently dropped when the link is opened.
 */
export interface OAuthParamsDto {
  clientId?: string;
  redirectUri?: string;
  scope?: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  nonce?: string;
  acrValues?: string;
  prompt?: string;
  /** RFC 8707 Resource Indicator — target resource for the issued token. */
  resource?: string;
  /** RFC 9396 raw `authorization_details` JSON. */
  authorizationDetails?: string;
  /** OIDC ui_locales — the language the relying party was showing. */
  uiLocales?: string;
  /** OIDC login_hint — a form prefill only, never identity. */
  loginHint?: string;
  /** The org hint (slug) — customer-lane.ts. */
  organization?: string;
  /** The customer-lane marker ('1'). */
  customer?: string;
}
