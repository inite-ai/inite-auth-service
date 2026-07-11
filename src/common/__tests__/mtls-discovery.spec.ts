import { ConfigService } from '@nestjs/config';
import { HealthController } from '../health.controller';
import { fakeSettings } from '../settings/settings.test-fixture';

/**
 * RFC 8705 discovery: certificate-bound-token support, the mTLS client-auth
 * methods, and mtls_endpoint_aliases appear only when MTLS_ENABLED is on.
 */
describe('HealthController — mTLS discovery metadata', () => {
  function metaFor(env: Record<string, string>): Record<string, unknown> {
    const config = {
      get: (k: string, d?: string) => env[k] ?? d,
    } as unknown as ConfigService;
    const controller = new HealthController(
      config,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      fakeSettings(env),
    );
    return controller.openidConfiguration() as Record<string, unknown>;
  }

  it('omits mTLS metadata and auth methods when disabled', () => {
    const meta = metaFor({});
    expect(meta).not.toHaveProperty('tls_client_certificate_bound_access_tokens');
    expect(meta).not.toHaveProperty('mtls_endpoint_aliases');
    expect(meta.token_endpoint_auth_methods_supported).not.toContain('tls_client_auth');
  });

  it('advertises certificate-bound tokens + auth methods when enabled', () => {
    const meta = metaFor({ MTLS_ENABLED: 'true' });
    expect(meta.tls_client_certificate_bound_access_tokens).toBe(true);
    expect(meta.token_endpoint_auth_methods_supported).toEqual(
      expect.arrayContaining(['tls_client_auth', 'self_signed_tls_client_auth']),
    );
  });

  it('exposes mtls_endpoint_aliases pointing at the mTLS host', () => {
    const meta = metaFor({
      MTLS_ENABLED: 'true',
      MTLS_ISSUER: 'https://mtls-auth-api.inite.ai',
    });
    expect(meta.mtls_endpoint_aliases).toEqual({
      token_endpoint: 'https://mtls-auth-api.inite.ai/v1/oauth/token',
      pushed_authorization_request_endpoint: 'https://mtls-auth-api.inite.ai/v1/oauth/par',
      revocation_endpoint: 'https://mtls-auth-api.inite.ai/v1/oauth/revoke',
      introspection_endpoint: 'https://mtls-auth-api.inite.ai/v1/oauth/introspect',
    });
  });

  it('omits aliases when no mTLS host is configured', () => {
    const meta = metaFor({ MTLS_ENABLED: 'true' });
    expect(meta).not.toHaveProperty('mtls_endpoint_aliases');
    expect(meta.tls_client_certificate_bound_access_tokens).toBe(true);
  });
});
