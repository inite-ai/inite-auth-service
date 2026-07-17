/**
 * Central registry of OAuth scopes this IdP understands. Single source of
 * truth for discovery (`scopes_supported`), RFC 7591 dynamic registration
 * and provisioning scripts — vertical scope lists previously lived only in
 * test fixtures and in each vertical's own repo.
 *
 * Scope semantics are enforced by the resource server that owns the
 * audience; the IdP's job is to advertise them and to filter every issued
 * token through the per-client `allowedScopes` allow-list.
 */

/** OIDC baseline advertised in discovery. */
export const STANDARD_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
] as const;

/**
 * inite-brain-service (audience `brain`). Mirrors `BrainScope` in the brain
 * repo (src/auth/api-key.types.ts) — keep the two lists in sync.
 */
export const BRAIN_SCOPES = [
  'brain:read',
  'brain:write',
  'brain:admin',
  'brain:read_pii',
  'registry:publish',
  'indexer:write',
] as const;

/**
 * Vertical scopes an anonymous RFC 7591 registration may request. The
 * sensitive tail of BRAIN_SCOPES (admin / PII / registry publishing) stays
 * operator-provisioned: a self-registered MCP client can ask a user for
 * read/write memory access, never for tenant administration.
 */
export const DCR_VERTICAL_SCOPES = ['brain:read', 'brain:write'] as const;

/** Everything the AS can put in a token — discovery `scopes_supported`. */
export function supportedScopes(): string[] {
  return [...STANDARD_SCOPES, ...BRAIN_SCOPES];
}

/** The subset RFC 7591 dynamic registration may grant to a new client. */
export function dcrSupportedScopes(): string[] {
  return [...STANDARD_SCOPES, ...DCR_VERTICAL_SCOPES];
}
