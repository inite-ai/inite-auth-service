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

// key → reason, required only when NODE_ENV=production.
const PROD_REQUIRED: ReadonlyArray<readonly [string, string]> = [
  ['JWT_PRIVATE_KEY', 'RS256 token signing; the HS256 fallback is dev-only'],
  ['REFRESH_TOKEN_HMAC_SECRET', 'refresh-token hashing'],
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

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];

  if (!present(config.DATABASE_URL)) errors.push('DATABASE_URL is required');
  if (!present(config.SESSION_SECRET) && !present(config.JWT_SECRET)) {
    errors.push('SESSION_SECRET or JWT_SECRET is required');
  }

  if (config.NODE_ENV === 'production') {
    for (const [key, why] of PROD_REQUIRED) {
      if (!present(config[key])) {
        errors.push(`${key} is required in production (${why})`);
      }
    }
  }

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
