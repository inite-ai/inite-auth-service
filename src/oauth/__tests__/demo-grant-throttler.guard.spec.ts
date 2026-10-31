import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { DemoGrantThrottlerGuard } from '../demo-grant-throttler.guard';
import { DEMO_RATE_PER_CLIENT, DEMO_RATE_PER_IP, DEMO_SUBJECT_TOKEN_TYPE } from '../demo-grant';
import { TOKEN_EXCHANGE_GRANT } from '../token-support';

/**
 * The demo grant's buckets: one per client_id, one per address, both on top
 * of the token endpoint's own limit. Real ThrottlerGuard machinery with the
 * in-memory storage, so the test exercises the counting, not a mock of it.
 */
describe('demo grant rate limit (per client and per address)', () => {
  let storage: ThrottlerStorageService;
  let guard: DemoGrantThrottlerGuard;

  beforeEach(async () => {
    storage = new ThrottlerStorageService();
    guard = new DemoGrantThrottlerGuard([{ ttl: 60_000, limit: 1000 }], storage, new Reflector());
    await guard.onModuleInit();
  });
  afterEach(() => storage.onApplicationShutdown());

  class Handler {
    token() {}
  }
  const call = (body: Record<string, unknown>, ip: string) => {
    const req = { body, ip, headers: {} };
    const res = { header: () => undefined };
    const ctx = {
      getHandler: () => Handler.prototype.token,
      getClass: () => Handler,
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    return guard.canActivate(ctx);
  };
  const demo = (clientId: string) => ({
    grant_type: TOKEN_EXCHANGE_GRANT,
    subject_token_type: DEMO_SUBJECT_TOKEN_TYPE,
    subject_token: 'demo:owner',
    client_id: clientId,
  });

  it(`stops one client after ${DEMO_RATE_PER_CLIENT} demo requests a minute, whatever the address`, async () => {
    for (let i = 0; i < DEMO_RATE_PER_CLIENT; i++) {
      await expect(call(demo('inite-estate'), `10.0.1.${i}`)).resolves.toBe(true);
    }
    await expect(call(demo('inite-estate'), '10.0.2.1')).rejects.toBeInstanceOf(ThrottlerException);
    // Another product is not starved by the first one.
    await expect(call(demo('inite-rent'), '10.0.2.2')).resolves.toBe(true);
  });

  it(`stops one address after ${DEMO_RATE_PER_IP} demo requests a minute, whatever the client`, async () => {
    for (let i = 0; i < DEMO_RATE_PER_IP; i++) {
      await expect(call(demo(`inite-p${i}`), '10.0.3.1')).resolves.toBe(true);
    }
    await expect(call(demo('inite-other'), '10.0.3.1')).rejects.toBeInstanceOf(ThrottlerException);
    await expect(call(demo('inite-other'), '10.0.3.2')).resolves.toBe(true);
  });

  it('leaves every other token request to the token endpoint limit', async () => {
    const other = { grant_type: TOKEN_EXCHANGE_GRANT, subject_token_type: 'urn:ietf:params:oauth:token-type:access_token', client_id: 'inite-estate' };
    for (let i = 0; i < DEMO_RATE_PER_IP + 5; i++) {
      await expect(call(other, '10.0.4.1')).resolves.toBe(true);
      await expect(call({ grant_type: 'refresh_token', client_id: 'inite-estate' }, '10.0.4.1')).resolves.toBe(true);
    }
  });
});
