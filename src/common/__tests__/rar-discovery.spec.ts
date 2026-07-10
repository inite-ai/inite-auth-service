import { ConfigService } from '@nestjs/config';
import { HealthController } from '../health.controller';

/**
 * RFC 9396 discovery: authorization_details_types_supported must appear in the
 * AS metadata only when RAR is enabled, and reflect the configured allow-list.
 */
describe('HealthController — RAR discovery metadata', () => {
  function controllerWith(env: Record<string, string>): HealthController {
    const config = {
      get: (k: string, d?: string) => env[k] ?? d,
    } as unknown as ConfigService;
    return new HealthController(
      config,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('omits authorization_details_types_supported when RAR is off', () => {
    const meta = controllerWith({}).openidConfiguration() as Record<string, unknown>;
    expect(meta).not.toHaveProperty('authorization_details_types_supported');
  });

  it('advertises the default types when RAR is on', () => {
    const meta = controllerWith({ RAR_ENABLED: 'true' }).openidConfiguration() as Record<
      string,
      unknown
    >;
    expect(meta.authorization_details_types_supported).toEqual([
      'inite_mcp_resource',
      'payment_initiation',
    ]);
  });

  it('reflects a custom AUTHORIZATION_DETAILS_TYPES allow-list', () => {
    const meta = controllerWith({
      RAR_ENABLED: 'true',
      AUTHORIZATION_DETAILS_TYPES: 'custom_a, custom_b',
    }).openidConfiguration() as Record<string, unknown>;
    expect(meta.authorization_details_types_supported).toEqual(['custom_a', 'custom_b']);
  });
});
