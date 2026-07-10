/**
 * Loose request shapes for the OAuth authorize/token endpoints.
 *
 * Intentionally interfaces, NOT class DTOs: the global ValidationPipe runs
 * with `forbidNonWhitelisted: true`, which would 400 on the extra query/body
 * params that real OAuth clients send (display, login_hint, …). OAuth requires
 * servers to ignore unknown params, so we type the raw object and read the
 * fields we care about, leaving the pipe to skip validation (non-class metatype).
 */

export interface AuthorizeQuery {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  prompt?: string;
  nonce?: string;
  acr_values?: string;
  request_uri?: string;
  /** JAR (RFC 9101) — a signed JWT carrying the authorize params. */
  request?: string;
  /** RFC 8707 Resource Indicator — target resource for the issued token. */
  resource?: string;
  /** RFC 9396 — JSON-encoded array of typed authorization_details objects. */
  authorization_details?: string;
}

/** Authorize params after PAR (request_uri) resolution, normalized to camelCase. */
export interface ResolvedAuthorizeParams {
  responseType?: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  prompt?: string;
  nonce?: string;
  acrValues?: string;
  /** RFC 8707 Resource Indicator — target resource for the issued token. */
  resource?: string;
  /** RFC 9396 — raw JSON `authorization_details` string, validated downstream. */
  authorizationDetails?: string;
}

export interface TokenRequestBody {
  grant_type?: string;
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  client_secret?: string;
  // RFC 7523 private_key_jwt client authentication
  client_assertion?: string;
  client_assertion_type?: string;
  code_verifier?: string;
  refresh_token?: string;
  scope?: string;
  audience?: string;
  // RFC 8693 Token Exchange
  subject_token?: string;
  subject_token_type?: string;
  actor_token?: string;
  actor_token_type?: string;
  requested_token_type?: string;
  // RFC 8707 Resource Indicators
  resource?: string;
  // RFC 9396 — authorization_details on the client_credentials grant.
  authorization_details?: string;
}
