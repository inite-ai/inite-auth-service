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
    expect(() => validateEnv({ ...devBase, DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
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

  it('requires FIELD_ENCRYPTION_KEY in production (provisioned in #108)', () => {
    const { FIELD_ENCRYPTION_KEY: _b, ...rest } = prodBase;
    expect(() => validateEnv(rest)).toThrow(/FIELD_ENCRYPTION_KEY.*production/s);
  });

  it('does not require those secrets in development', () => {
    expect(() => validateEnv({ ...devBase })).not.toThrow();
  });
});

/**
 * Operator settings in env are held to the settings registry's validator.
 * Before, `REFRESH_REUSE_GRACE=off` silently ran a 30 s grace and
 * `JWT_ACCESS_TOKEN_EXPIRY=1hr` silently issued 10-minute tokens.
 */
describe('validateEnv — operator settings', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it.each([
    ['REFRESH_REUSE_GRACE', 'off'],
    ['REFRESH_REUSE_GRACE', '30sec'],
    ['REFRESH_REUSE_GRACE', '2m'],
    ['JWT_ACCESS_TOKEN_EXPIRY', '1hr'],
    ['JWT_ACCESS_TOKEN_EXPIRY', '2 days'],
  ])('a malformed duration fails boot in production: %s=%s', (key, value) => {
    expect(() => validateEnv({ ...prodBase, [key]: value })).toThrow(new RegExp(key));
  });

  it('in development a malformed duration warns and falls back to the registry default', () => {
    const out = validateEnv({
      ...devBase,
      REFRESH_REUSE_GRACE: 'off',
      JWT_ACCESS_TOKEN_EXPIRY: '1hr',
    });
    expect(out.REFRESH_REUSE_GRACE).toBe('30s');
    expect(out.JWT_ACCESS_TOKEN_EXPIRY).toBe('10m');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('REFRESH_REUSE_GRACE'));
  });

  it('valid durations pass untouched, 0 included', () => {
    const out = validateEnv({
      ...prodBase,
      REFRESH_REUSE_GRACE: '0',
      JWT_ACCESS_TOKEN_EXPIRY: '1h',
    });
    expect(out).toMatchObject({ REFRESH_REUSE_GRACE: '0', JWT_ACCESS_TOKEN_EXPIRY: '1h' });
  });

  it('a malformed flag warns (it already reads as off) and does not block boot', () => {
    const out = validateEnv({ ...prodBase, SCIM_ENABLED: 'yes' });
    expect(out.SCIM_ENABLED).toBe('false');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SCIM_ENABLED'));
  });
});
