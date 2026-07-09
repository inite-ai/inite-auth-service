import { Request } from 'express';
import { TokenEndpointThrottlerGuard } from '../token-throttler.guard';

type GuardWithTracker = { getTracker(req: Request): Promise<string> };

/**
 * Token-endpoint throttler tracker tests. We exercise the override
 * directly rather than spinning up the full ThrottlerGuard so the
 * tracker logic is testable without Nest DI.
 */
describe('TokenEndpointThrottlerGuard.getTracker', () => {
  function makeGuard(): GuardWithTracker {
    // ThrottlerGuard requires constructor args via DI; bypass by
    // constructing a bare object that just exposes getTracker.
    const guard = Object.create(TokenEndpointThrottlerGuard.prototype);
    return guard;
  }

  it('keys by client_id when grant_type is client_credentials', async () => {
    const guard = makeGuard();
    const req = {
      body: { grant_type: 'client_credentials', client_id: 'smart-chat-brain' },
      headers: {},
      ip: '10.0.0.1',
    } as unknown as Request;
    const key = await guard.getTracker(req);
    expect(key).toBe('oauth:token:cc:smart-chat-brain');
  });

  it('falls back to IP for authorization_code grants', async () => {
    const guard = makeGuard();
    const req = {
      body: { grant_type: 'authorization_code', client_id: 'smart-chat' },
      headers: {},
      ip: '10.0.0.2',
    } as unknown as Request;
    const key = await guard.getTracker(req);
    expect(key).toBe('oauth:token:user:10.0.0.2');
  });

  it('falls back to IP when body is empty (probe / malformed)', async () => {
    const guard = makeGuard();
    const req = { body: {}, headers: {}, ip: '10.0.0.3' } as unknown as Request;
    const key = await guard.getTracker(req);
    expect(key).toBe('oauth:token:user:10.0.0.3');
  });

  it('falls back to IP when client_credentials body has no client_id', async () => {
    const guard = makeGuard();
    const req = {
      body: { grant_type: 'client_credentials' },
      headers: {},
      ip: '10.0.0.4',
    } as unknown as Request;
    const key = await guard.getTracker(req);
    expect(key).toBe('oauth:token:user:10.0.0.4');
  });

  it('uses x-forwarded-for first segment when present', async () => {
    const guard = makeGuard();
    const req = {
      body: {},
      headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
      ip: '10.0.0.1',
    } as unknown as Request;
    const key = await guard.getTracker(req);
    expect(key).toBe('oauth:token:user:203.0.113.1');
  });
});
