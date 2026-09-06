import { ConfigService } from '@nestjs/config';
import { HealthController } from '../health.controller';
import { fakeSettings } from '../settings/settings.test-fixture';

/**
 * RFC 8707 discovery. The RFC itself registers no metadata field, so
 * `resource_indicators_supported` is a de-facto convention carried as RFC 8414
 * §2 additional metadata — which makes it easy to drop by accident. Both
 * well-known paths serve the same document and both are asserted here.
 *
 * The claim is only honest while `resource` survives the whole authorize flow;
 * `oauth/__tests__/authorize-param-passthrough.spec.ts` is what keeps that true.
 */
describe('HealthController — RFC 8707 discovery metadata', () => {
  function controller(): HealthController {
    const config = {
      get: (_k: string, d?: string) => d,
    } as unknown as ConfigService;
    return new HealthController(
      config,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      fakeSettings({}),
    );
  }

  it('advertises resource indicator support on the OIDC discovery path', () => {
    const meta = controller().openidConfiguration() as Record<string, unknown>;
    expect(meta.resource_indicators_supported).toBe(true);
  });

  it('advertises it on the RFC 8414 path MCP clients read', () => {
    const meta = controller().oauthAuthorizationServer() as Record<string, unknown>;
    expect(meta.resource_indicators_supported).toBe(true);
  });
});
