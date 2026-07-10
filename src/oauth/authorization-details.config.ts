/**
 * Shared RFC 9396 config helpers — pure functions (no DI) so both the
 * validating service and the discovery metadata resolve the supported
 * `authorization_details` types identically.
 */

/** Built-in default `authorization_details` types when none are configured. */
export const DEFAULT_AUTHORIZATION_DETAILS_TYPES = [
  'inite_mcp_resource',
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
