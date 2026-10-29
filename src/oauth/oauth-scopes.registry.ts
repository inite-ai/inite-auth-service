/**
 * Central registry of OAuth scopes this IdP understands. Single source of
 * truth for discovery (`scopes_supported`), RFC 7591 dynamic registration
 * and provisioning scripts — vertical scope lists previously lived only in
 * test fixtures and in each vertical's own repo.
 *
 * Scope semantics are enforced by the resource server that owns the
 * audience; the IdP's job is to advertise them and to decide what a client
 * may be granted. Every grant filters through the per-client `allowedScopes`
 * allow-list: the M2M grants strictly, the user grants (authorization_code,
 * refresh_token, device_code) with the OIDC baseline on top, and a
 * dynamically registered client is capped to {@link dcrSupportedScopes}
 * instead (see {@link permittedScopes}).
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
 * The person's INITE billing account (resource `https://billing.inite.ai/mcp`).
 * `billing:account` lets a client read what the person has bought — orders,
 * subscriptions, entitlements, credit balance — and start a checkout whose
 * payment the person completes themselves on the hosted page. It moves no
 * money: paying from a balance is `wallet:pay`, with its own limits and
 * passkey. Enforced by billing's MCP endpoint.
 */
export const BILLING_SCOPES = ['billing:account'] as const;

/**
 * inite.fund (strateg, resource `https://app.inite.fund/mcp`). Every caller
 * of the fund's MCP needs `fund:read` (viewer); `fund:write` lets it act as
 * an operator at most, never admin. Enforced by the fund's resource server.
 */
export const FUND_SCOPES = ['fund:read', 'fund:write'] as const;

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
  ...BILLING_SCOPES,
  ...FUND_SCOPES,
] as const;

/** Everything the AS can put in a token — discovery `scopes_supported`. */
export function supportedScopes(): string[] {
  return [
    ...STANDARD_SCOPES,
    ...BRAIN_SCOPES,
    ...MIKEFLUFF_SCOPES,
    ...WALLET_SCOPES,
    ...BILLING_SCOPES,
    ...FUND_SCOPES,
  ];
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

/** What {@link grantableScope} needs to know about the client. */
export interface ScopeBoundClient {
  clientId: string;
  allowedScopes?: readonly string[] | null;
  isPublic?: boolean | null;
}

/**
 * The requested scopes this client may hold, without any default.
 *
 * - A dynamically registered client is held to the open-registration set
 *   ({@link dcrSupportedScopes}). Its registered `scope` stays informational
 *   on purpose: an MCP client registers first and learns the scopes it needs
 *   from the resource server afterwards.
 * - Every other client is held to its own `allowedScopes`, plus the OIDC
 *   baseline ({@link STANDARD_SCOPES}), which names the person and carries
 *   no privilege at a resource server. A first-party client skips the consent
 *   screen, so before this rule a product client (or anyone holding its
 *   secret) could ask for `brain:admin` or `fund:write` and get it silently.
 * - A public client (no secret, e.g. `inite-cli`) may also ask for what an
 *   open registration could ({@link DCR_VERTICAL_SCOPES}): it is an agent's
 *   door to the family MCPs, the same as a self-registered one, and is held
 *   to no more than one either.
 *
 * Anything else is dropped (RFC 6749 §3.3 lets the server grant less than
 * was asked; the token response's `scope` says what was granted).
 */
export function permittedScopes(
  client: ScopeBoundClient | string | null | undefined,
  requested: string | null | undefined,
): string[] {
  const scopes = [...new Set((requested ?? '').split(/\s+/).filter(Boolean))];
  const clientId = typeof client === 'string' ? client : client?.clientId;
  if (isDynamicClientId(clientId)) {
    const allowed = new Set(dcrSupportedScopes());
    return scopes.filter((s) => allowed.has(s));
  }
  if (!client || typeof client === 'string') {
    // No row to check against: the OIDC baseline only.
    const std = new Set<string>(STANDARD_SCOPES);
    return scopes.filter((s) => std.has(s));
  }
  const allowed = new Set<string>([
    ...STANDARD_SCOPES,
    ...(client.allowedScopes ?? []),
    ...(client.isPublic === true ? DCR_VERTICAL_SCOPES : []),
  ]);
  return scopes.filter((s) => allowed.has(s));
}

/**
 * What an authorization_code request may actually be granted: the
 * {@link permittedScopes}, or {@link DEFAULT_SCOPE} when nothing is left, as
 * an empty request always has.
 */
export function grantableScope(
  client: ScopeBoundClient | string | null | undefined,
  requested: string | null | undefined,
): string {
  const scopes = permittedScopes(client, requested);
  return scopes.length > 0 ? scopes.join(' ') : DEFAULT_SCOPE;
}
