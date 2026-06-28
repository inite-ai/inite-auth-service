/**
 * External IdP federation (social login) shared types.
 *
 * We implement the OAuth 2.0 / OIDC Authorization Code flow directly per
 * provider rather than via Passport strategies: it keeps the flow free of
 * Passport's global/session state, makes the linking logic unit-testable in
 * isolation, and gives the generic OIDC connector for free via discovery.
 */

/** A provider's OAuth/OIDC endpoints (static for Google/GitHub, discovered for OIDC). */
export interface ProviderEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  /** OIDC UserInfo / provider profile endpoint. */
  userinfoEndpoint?: string;
}

/** Token-endpoint response (only the fields we consume). */
export interface TokenResponse {
  access_token: string;
  token_type?: string;
  id_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * Provider profile normalized to a common shape. `subject` is the IdP's
 * stable identifier (OIDC `sub`, GitHub numeric id) — the key we federate on.
 */
export interface NormalizedProfile {
  provider: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  /** Non-sensitive claims snapshot persisted for debugging / future mapping. */
  raw: Record<string, unknown>;
}

/** Resolved, enabled provider configuration. */
export interface ProviderConfig {
  id: string;
  displayName: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  /** Google/OIDC support PKCE (S256); GitHub OAuth does not. */
  usesPkce: boolean;
  /** Static endpoints; null means "resolve via OIDC discovery". */
  endpoints: ProviderEndpoints | null;
  /** OIDC issuer for discovery (generic connector only). */
  issuer?: string;
}

/** Short-lived CSRF/PKCE state stashed in Redis between /start and /callback. */
export interface FederationState {
  provider: string;
  codeVerifier?: string;
  nonce: string;
  returnTo: string;
  /** OAuth-continuation params if login was initiated from an /authorize flow. */
  oauthParams: Record<string, string>;
}

/** Result of resolving a federated profile to a local user. */
export interface FederationResult {
  user: { id: string; did: string; email: string | null; name: string | null };
  isNewUser: boolean;
  returnTo: string;
  oauthParams: Record<string, string>;
}

/**
 * Raised when a federated identity's email matches an existing local account
 * but the provider did NOT assert the email as verified. Auto-linking there
 * would let anyone who can set that (unverified) email at the IdP take over the
 * local account, so we refuse and require the user to sign in and link
 * manually. The controller surfaces this as a redirect with an error code.
 */
export class FederationEmailConflictError extends Error {
  constructor(public readonly email: string) {
    super(
      `An account already exists for ${email}. Sign in and link this provider ` +
        `from account settings instead.`,
    );
    this.name = 'FederationEmailConflictError';
  }
}
