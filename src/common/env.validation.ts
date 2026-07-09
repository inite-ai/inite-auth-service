/**
 * Boot-time environment validation for ConfigModule (`validate` hook).
 *
 * Fail fast at startup instead of at the first token mint / DB query / crypto
 * op. Dependency-free (no Joi/zod) so it can't add a supply-chain surface to an
 * auth server. Production requires the full security-critical set; dev only
 * needs a database and a session/JWT secret so `docker compose up` still boots.
 */

function present(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// key → reason, FATAL when missing in production. Only secrets on the core
// token path belong here — every login/refresh needs them, so booting without
// one is never correct.
const PROD_REQUIRED: ReadonlyArray<readonly [string, string]> = [
  ['JWT_PRIVATE_KEY', 'RS256 token signing; the HS256 fallback is dev-only'],
  ['REFRESH_TOKEN_HMAC_SECRET', 'refresh-token hashing'],
];

// key → reason, WARN (not fatal) when missing in production. FieldCrypto is
// intentionally lazy: a missing FIELD_ENCRYPTION_KEY yields a disabled instance
// that only throws if an at-rest secret (2FA / federation) is actually written,
// and legacy plaintext still decrypts. Making it a boot-blocker contradicted
// that contract and could take the whole auth server down over an unused
// feature — so it's a startup warning instead. Set the key to enable those
// features (and consider promoting it back to required once provisioned).
const PROD_RECOMMENDED: ReadonlyArray<readonly [string, string]> = [
  ['FIELD_ENCRYPTION_KEY', 'at-rest encryption of 2FA + federation secrets'],
];

// key → predicate → message, checked only when the value is present.
const FORMAT_RULES: ReadonlyArray<
  readonly [string, (v: string) => boolean, string]
> = [
  ['DATABASE_URL', (v) => /^postgres(ql)?:\/\//.test(v), 'must be a postgres:// URL'],
  ['PORT', (v) => !Number.isNaN(Number(v)), 'must be numeric'],
  ['REDIS_PORT', (v) => !Number.isNaN(Number(v)), 'must be numeric'],
];

/** Production-only checks: fatal required secrets + non-fatal recommendations. */
function checkProduction(
  config: Record<string, unknown>,
  errors: string[],
): void {
  for (const [key, why] of PROD_REQUIRED) {
    if (!present(config[key])) {
      errors.push(`${key} is required in production (${why})`);
    }
  }
  for (const [key, why] of PROD_RECOMMENDED) {
    if (!present(config[key])) {
      // Non-fatal: warn but let the app boot. The dependent feature fails
      // safe at point-of-use if it's ever exercised without the key.
      console.warn(`[env] ${key} is not set in production (${why})`);
    }
  }
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];

  if (!present(config.DATABASE_URL)) errors.push('DATABASE_URL is required');
  if (!present(config.SESSION_SECRET) && !present(config.JWT_SECRET)) {
    errors.push('SESSION_SECRET or JWT_SECRET is required');
  }

  if (config.NODE_ENV === 'production') checkProduction(config, errors);

  for (const [key, ok, message] of FORMAT_RULES) {
    const value = config[key];
    if (present(value) && !ok(value)) errors.push(`${key} ${message}`);
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n  - ${errors.join('\n  - ')}`,
    );
  }
  return config;
}
