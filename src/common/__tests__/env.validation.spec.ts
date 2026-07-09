import { validateEnv } from '../env.validation';

const devBase = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/auth',
  SESSION_SECRET: 'dev-secret',
};

const prodBase = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db:5432/auth',
  SESSION_SECRET: 'x',
  JWT_PRIVATE_KEY: 'pk',
  REFRESH_TOKEN_HMAC_SECRET: 'hmac',
  FIELD_ENCRYPTION_KEY: 'fek',
};

describe('validateEnv', () => {
  it('accepts a minimal dev config', () => {
    expect(() => validateEnv({ ...devBase })).not.toThrow();
  });

  it('requires DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...rest } = devBase;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL is required/);
  });

  it('requires a session or JWT secret', () => {
    const { SESSION_SECRET: _omit, ...rest } = devBase;
    expect(() => validateEnv(rest)).toThrow(/SESSION_SECRET or JWT_SECRET/);
  });

  it('accepts JWT_SECRET as the secret alternative', () => {
    const { SESSION_SECRET: _omit, ...rest } = devBase;
    expect(() => validateEnv({ ...rest, JWT_SECRET: 'j' })).not.toThrow();
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => validateEnv({ ...devBase, DATABASE_URL: 'mysql://x' })).toThrow(
      /postgres/,
    );
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv({ ...devBase, PORT: 'abc' })).toThrow(/PORT must be numeric/);
  });

  it('accepts a full production config', () => {
    expect(() => validateEnv({ ...prodBase })).not.toThrow();
  });

  it('requires production security secrets', () => {
    const { JWT_PRIVATE_KEY: _a, FIELD_ENCRYPTION_KEY: _b, ...rest } = prodBase;
    expect(() => validateEnv(rest)).toThrow(/JWT_PRIVATE_KEY.*production/s);
  });

  it('does not require those secrets in development', () => {
    expect(() => validateEnv({ ...devBase })).not.toThrow();
  });
});
