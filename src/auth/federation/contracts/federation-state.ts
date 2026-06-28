/** Short-lived CSRF/PKCE state stashed in Redis between /start and /callback. */
export interface FederationState {
  provider: string;
  codeVerifier?: string;
  nonce: string;
  returnTo: string;
  /** OAuth-continuation params if login was initiated from an /authorize flow. */
  oauthParams: Record<string, string>;
}
