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
