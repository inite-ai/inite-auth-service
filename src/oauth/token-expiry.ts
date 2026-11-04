/**
 * Durations as the settings registry accepts them (`duration` type:
 * `^\d+[smhd]?$`, e.g. '10m', '1h', '3600s'), in seconds. A bare number is
 * seconds. Null when the value is not a duration.
 */
export function durationSeconds(value: string): number | null {
  const m = /^(\d+)([smhd]?)$/.exec(value.trim());
  if (!m) return null;
  // Group 1 (\d+) is mandatory in the matched regex, so it is present.
  const n = parseInt(m[1]!, 10);
  const unit: Record<string, number> = { '': 1, s: 1, m: 60, h: 3600, d: 86400 };
  return n * (unit[m[2] ?? ''] ?? 1);
}

/**
 * Translate the expressive JWT expiry string ('10m', '1h', '3600s') into
 * seconds for the OAuth token-response `expires_in` field. RFC 6749 §5.1
 * requires this as a number, and it must be the token's real lifetime: a
 * client told less than that refreshes more often than it needs to.
 */
export function expirySeconds(expiry: string): number {
  return durationSeconds(expiry) ?? 600;
}
