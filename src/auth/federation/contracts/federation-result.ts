/** Result of resolving a federated profile to a local user. */
export interface FederationResult {
  user: { id: string; did: string; email: string | null; name: string | null };
  isNewUser: boolean;
  returnTo: string;
  oauthParams: Record<string, string>;
}
