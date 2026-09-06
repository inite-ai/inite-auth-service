/**
 * The /authorize continuation stashed on a magic link and handed back to the
 * SPA as `oauth_params`, so the flow can resume after an out-of-band login.
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
}
