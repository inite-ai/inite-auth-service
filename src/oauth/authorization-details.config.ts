/**
 * Shared RFC 9396 config helpers — pure functions (no DI) so both the
 * validating service and the discovery metadata resolve the supported
 * `authorization_details` types identically.
 */

/**
 * The MCP per-tool grant type. Convention (consumed by verticals' MCP
 * servers, e.g. brain):
 *   { type: 'inite_mcp_resource',
 *     locations?: ['https://brain.inite.ai'],   // target deployment(s)
 *     actions?: ['search_knowledge', 'read'] }  // vertical action names / kinds
 * Entries of this type also ride RFC 8693 token exchange so a BFF-exchanged
 * token keeps the user's per-tool consent.
 */
export const MCP_AUTHORIZATION_DETAILS_TYPE = 'inite_mcp_resource';

/** Built-in default `authorization_details` types when none are configured. */
export const DEFAULT_AUTHORIZATION_DETAILS_TYPES = [
  MCP_AUTHORIZATION_DETAILS_TYPE,
  'payment_initiation',
];

/**
 * Resolve the active supported-type allow-list from the comma-separated
 * AUTHORIZATION_DETAILS_TYPES value, falling back to the built-in defaults.
 */
export function resolveAuthorizationDetailsTypes(raw: string | undefined | null): string[] {
  if (!raw) return [...DEFAULT_AUTHORIZATION_DETAILS_TYPES];
  const types = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return types.length ? types : [...DEFAULT_AUTHORIZATION_DETAILS_TYPES];
}
