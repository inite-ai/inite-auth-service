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
 * A token TTL setting ('10m', '1h', '3600', '3600s') in seconds. The same
 * number is passed to `jwtService.sign` (a number there is seconds, where
 * jsonwebtoken reads a unitless STRING as milliseconds) and returned as
 * `expires_in` (RFC 6749 §5.1), so the token's `exp` and what the client is
 * told always agree.
 */
export function expirySeconds(expiry: string, fallbackSeconds: number): number {
  return durationSeconds(expiry) ?? fallbackSeconds;
}
