import { ProviderEndpoints } from './provider-endpoints';

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
