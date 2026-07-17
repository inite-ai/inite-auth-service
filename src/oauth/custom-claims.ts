/**
 * Per-client custom-claim sanitizer.
 *
 * OAuthClient.customClaims lets an operator stamp vertical-facing claims
 * on every token issued to (or minted by) a client — the delivery channel
 * for brain's ABAC `policy` sets and indexer `packs` bindings, keyed to
 * the OAuth client an agent registered as. The surface is deliberately
 * tiny: only allow-listed keys, only identifier-charset string arrays,
 * silent drop of everything else. Registered/identity claims can never be
 * overridden because they simply aren't in the allow-list.
 */

/** Vertical-facing claim keys a client may carry. */
const ALLOWED_KEYS = new Set(['policy', 'packs']);
/** Matches the verticals' policy-set / pack-id charsets. */
const VALID_VALUE = /^[a-z][a-z0-9_-]{1,63}$/;
const MAX_VALUES_PER_KEY = 16;

/**
 * Reduce a raw customClaims JSON column to the safe, mergeable subset.
 * Never throws — a mis-edited column degrades to "no custom claims",
 * not a broken token endpoint.
 */
export function sanitizeCustomClaims(raw: unknown): Record<string, string[]> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key) || !Array.isArray(value)) continue;
    const values = value
      .filter((v): v is string => typeof v === 'string')
      .filter((v) => VALID_VALUE.test(v))
      .slice(0, MAX_VALUES_PER_KEY);
    if (values.length > 0) out[key] = values;
  }
  return out;
}
