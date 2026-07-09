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

  it('requires core token secrets (JWT_PRIVATE_KEY) in production', () => {
    const { JWT_PRIVATE_KEY: _a, ...rest } = prodBase;
    expect(() => validateEnv(rest)).toThrow(/JWT_PRIVATE_KEY.*production/s);
  });

  it('requires REFRESH_TOKEN_HMAC_SECRET in production', () => {
    const { REFRESH_TOKEN_HMAC_SECRET: _a, ...rest } = prodBase;
    expect(() => validateEnv(rest)).toThrow(/REFRESH_TOKEN_HMAC_SECRET.*production/s);
  });

  it('warns but does NOT fail boot when FIELD_ENCRYPTION_KEY is missing in production', () => {
    const { FIELD_ENCRYPTION_KEY: _b, ...rest } = prodBase;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(() => validateEnv(rest)).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('FIELD_ENCRYPTION_KEY'));
    } finally {
      warn.mockRestore();
    }
  });

  it('does not require those secrets in development', () => {
    expect(() => validateEnv({ ...devBase })).not.toThrow();
  });
});
