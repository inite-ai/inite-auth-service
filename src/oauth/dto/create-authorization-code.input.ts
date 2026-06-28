/**
 * Input contract for OAuthService.createAuthorizationCode. Grouped into a
 * single typed object so the method stays within the max-params gate and so
 * callers name each field at the call site.
 */
export interface CreateAuthorizationCodeInput {
  userId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  /** OIDC nonce (core §3.1.2.1) — round-tripped into the id_token at /token. */
  nonce?: string;
  /** Achieved acr to persist on the code (see StepUpService). */
  acrValues?: string;
  /** RFC 8176 authentication methods used for this session. */
  amr?: string[];
}
