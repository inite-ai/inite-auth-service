import { BadRequestException } from '@nestjs/common';
import { AuthorizationDetailsService } from '../authorization-details.service';
import { fakeSettings } from '../../common/settings/settings.test-fixture';

/**
 * RFC 9396 validator. A rejection must carry the `invalid_authorization_details`
 * OAuth error code (§5); a valid array round-trips unchanged.
 */
describe('AuthorizationDetailsService', () => {
  function make(env: Record<string, string | undefined>): AuthorizationDetailsService {
    return new AuthorizationDetailsService(fakeSettings(env));
  }

  const enabled = () => make({ RAR_ENABLED: 'true' });

  function expectRejected(fn: () => unknown) {
    try {
      fn();
      throw new Error('expected a rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        error: 'invalid_authorization_details',
      });
    }
  }

  it('returns undefined for an absent parameter', () => {
    expect(enabled().parse(undefined)).toBeUndefined();
    expect(enabled().parse('')).toBeUndefined();
  });

  it('accepts a valid array of supported-type details', () => {
    const raw = JSON.stringify([
      { type: 'inite_mcp_resource', locations: ['https://mcp'], actions: ['read'] },
    ]);
    const out = enabled().parse(raw) ?? [];
    expect(out).toHaveLength(1);
    expect(out[0]?.type).toBe('inite_mcp_resource');
    expect(out[0]?.actions).toEqual(['read']);
  });

  it('rejects the parameter when RAR is disabled', () => {
    expectRejected(() => make({}).parse(JSON.stringify([{ type: 'inite_mcp_resource' }])));
  });

  it('rejects non-JSON', () => {
    expectRejected(() => enabled().parse('{not json'));
  });

  it('rejects a non-array / empty array', () => {
    expectRejected(() => enabled().parse(JSON.stringify({ type: 'x' })));
    expectRejected(() => enabled().parse('[]'));
  });

  it('rejects an element missing a string type', () => {
    expectRejected(() => enabled().parse(JSON.stringify([{ locations: ['x'] }])));
    expectRejected(() => enabled().parse(JSON.stringify([{ type: 123 }])));
  });

  it('rejects an unsupported type', () => {
    expectRejected(() => enabled().parse(JSON.stringify([{ type: 'totally_unknown' }])));
  });

  it('honors a custom AUTHORIZATION_DETAILS_TYPES allowlist', () => {
    const svc = make({ RAR_ENABLED: 'true', AUTHORIZATION_DETAILS_TYPES: 'custom_a, custom_b' });
    expect(svc.supportedTypes()).toEqual(['custom_a', 'custom_b']);
    expect(svc.parse(JSON.stringify([{ type: 'custom_a' }]))).toHaveLength(1);
    expectRejected(() => svc.parse(JSON.stringify([{ type: 'inite_mcp_resource' }])));
  });
});
