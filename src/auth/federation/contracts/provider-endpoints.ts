/** A provider's OAuth/OIDC endpoints (static for Google/GitHub, discovered for OIDC). */
export interface ProviderEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  /** OIDC UserInfo / provider profile endpoint. */
  userinfoEndpoint?: string;
}
