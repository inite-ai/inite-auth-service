import { ConfigService } from '@nestjs/config';
import { FederationProviders } from '../federation-providers.service';
import {
  FederationConfigStore,
  FederationDbEntry,
} from '../federation-config.store';

/**
 * DB-over-env resolution: a FederationProvider row wins over env, and an
 * explicitly-disabled row suppresses a provider even when env creds exist.
 */
function build(
  env: Record<string, string | undefined>,
  entries: Record<string, FederationDbEntry>,
): FederationProviders {
  const config = {
    get: (k: string) => env[k],
  } as unknown as ConfigService;
  const store = {
    getEntry: (slug: string) => entries[slug],
  } as unknown as FederationConfigStore;
  return new FederationProviders(config, store);
}

const GOOGLE_ENV = {
  GOOGLE_CLIENT_ID: 'env-google-id',
  GOOGLE_CLIENT_SECRET: 'env-google-secret',
};

describe('FederationProviders DB resolution', () => {
  it('falls back to env when no DB row exists', () => {
    const svc = build(GOOGLE_ENV, {});
    expect(svc.resolveConfig('google').clientId).toBe('env-google-id');
    expect(svc.getEnabledProviders().map((p) => p.id)).toContain('google');
  });

  it('lets an enabled DB row override env', () => {
    const svc = build(GOOGLE_ENV, {
      google: {
        enabled: true,
        displayName: 'Google',
        clientId: 'db-google-id',
        clientSecret: 'db-secret',
        scopes: [],
        issuer: null,
      },
    });
    expect(svc.resolveConfig('google').clientId).toBe('db-google-id');
  });

  it('suppresses a provider when the DB row is disabled, even with env creds', () => {
    const svc = build(GOOGLE_ENV, {
      google: {
        enabled: false,
        displayName: 'Google',
        clientId: 'db-google-id',
        clientSecret: 'db-secret',
        scopes: [],
        issuer: null,
      },
    });
    expect(svc.getEnabledProviders().map((p) => p.id)).not.toContain('google');
    expect(() => svc.resolveConfig('google')).toThrow(/not-configured/);
  });

  it('requires an issuer for a DB-backed oidc connector', () => {
    const svc = build(
      {},
      {
        oidc: {
          enabled: true,
          displayName: 'SSO',
          clientId: 'id',
          clientSecret: 'sec',
          scopes: [],
          issuer: null,
        },
      },
    );
    expect(() => svc.resolveConfig('oidc')).toThrow(/not-configured/);
  });
});
