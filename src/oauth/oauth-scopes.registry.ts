/**
 * Central registry of OAuth scopes this IdP understands. Single source of
 * truth for discovery (`scopes_supported`), RFC 7591 dynamic registration
 * and provisioning scripts — vertical scope lists previously lived only in
 * test fixtures and in each vertical's own repo.
 *
 * Scope semantics are enforced by the resource server that owns the
 * audience; the IdP's job is to advertise them and to decide what a client
 * may be granted. The M2M grants filter through the per-client
 * `allowedScopes` allow-list; the authorization_code flow does not (the
 * person on the consent screen is the gate), except that a dynamically
 * registered client is capped to {@link dcrSupportedScopes} by
 * {@link grantableScope}.
 */

/** OIDC baseline advertised in discovery. */
export const STANDARD_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const;

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
 * www.mikefluff.com's MCP server (resource `https://www.mikefluff.com/mcp`).
 * An agent acting for a person: `mikefluff:purchase` opens a book checkout
 * in that person's account (they still confirm the payment), and
 * `mikefluff:booking` books a call in their name. Enforced by the MCP server.
 */
export const MIKEFLUFF_SCOPES = ['mikefluff:purchase', 'mikefluff:booking'] as const;

/**
 * The person's INITE wallet (billing, resource `https://billing.inite.ai/mcp/wallet`).
 * `wallet:pay` lets an agent pay from it: on the way in it becomes an
 * `inite_wallet` authorization detail with the default limits, so the person
 * sees the limits on the consent screen and approves with a passkey
 * (wallet-grant.ts). MCP clients ask for scopes, not authorization_details.
 */
export const WALLET_SCOPES = ['wallet:pay'] as const;

/**
 * Vertical scopes an anonymous RFC 7591 registration may request. The
 * sensitive tail of BRAIN_SCOPES (admin / PII / registry publishing) stays
 * operator-provisioned: a self-registered MCP client can ask a user for
 * read/write memory access, never for tenant administration.
 */
export const DCR_VERTICAL_SCOPES = [
  'brain:read',
  'brain:write',
  ...MIKEFLUFF_SCOPES,
  ...WALLET_SCOPES,
] as const;

/** Everything the AS can put in a token — discovery `scopes_supported`. */
export function supportedScopes(): string[] {
  return [...STANDARD_SCOPES, ...BRAIN_SCOPES, ...MIKEFLUFF_SCOPES, ...WALLET_SCOPES];
}

/** The subset RFC 7591 dynamic registration may grant to a new client. */
export function dcrSupportedScopes(): string[] {
  return [...STANDARD_SCOPES, ...DCR_VERTICAL_SCOPES];
}

/** The scope granted when a request names none. */
export const DEFAULT_SCOPE = 'openid profile email';

/** RFC 7591 clients get a `dcr_` client_id (OAuthClientRegistryService). */
export function isDynamicClientId(clientId: string | null | undefined): boolean {
  return typeof clientId === 'string' && clientId.startsWith('dcr_');
}

/**
 * What an authorization_code request may actually be granted.
 *
 * /authorize used to pass any requested scope through to the token, so a
 * self-registered MCP client could ask a person for `brain:admin` and, with
 * one click on the consent screen, get it. A dynamically registered client is
 * now held to the open-registration set; anything else it asks for is
 * dropped (RFC 6749 §3.3 lets the server grant less than was asked).
 * Operator-provisioned clients are unchanged. An empty result falls back to
 * {@link DEFAULT_SCOPE}, as an empty request always has.
 */
export function grantableScope(
  clientId: string | null | undefined,
  requested: string | null | undefined,
): string {
  let scopes = [...new Set((requested ?? '').split(/\s+/).filter(Boolean))];
  if (isDynamicClientId(clientId)) {
    const allowed = new Set(dcrSupportedScopes());
    scopes = scopes.filter((s) => allowed.has(s));
  }
  return scopes.length > 0 ? scopes.join(' ') : DEFAULT_SCOPE;
}
