import { LoginEmailThrottlerGuard } from '../guards/login-throttler.guard';
import { UserOrIpThrottlerGuard } from '../guards/user-or-ip-throttler.guard';

type TrackerGuard = { getTracker(req: Record<string, unknown>): Promise<string> };

describe('LoginEmailThrottlerGuard.getTracker', () => {
  const guard = Object.create(LoginEmailThrottlerGuard.prototype) as TrackerGuard;

  it('keys on the lowercased email when present in the body', async () => {
    const tracker = await guard.getTracker({
      body: { email: 'Test@Example.COM' },
      ip: '10.0.0.1',
    });
    expect(tracker).toBe('login-email:test@example.com');
  });

  it('falls back to IP when no email in body', async () => {
    const tracker = await guard.getTracker({
      body: {},
      ip: '203.0.113.4',
    });
    expect(tracker).toBe('login-ip:203.0.113.4');
  });

  it('handles missing IP gracefully', async () => {
    const tracker = await guard.getTracker({ body: {} });
    expect(tracker).toBe('login-ip:unknown');
  });

  it('coalesces both surrounded-whitespace and case variants to the same bucket', async () => {
    const a = await guard.getTracker({
      body: { email: '  someone@example.com  ' },
    });
    const b = await guard.getTracker({
      body: { email: 'SOMEONE@example.com' },
    });
    expect(a).toBe(b);
  });
});

describe('UserOrIpThrottlerGuard.getTracker', () => {
  const guard = Object.create(UserOrIpThrottlerGuard.prototype) as TrackerGuard;

  it('keys on user.userId when JWT-authenticated', async () => {
    const tracker = await guard.getTracker({
      user: { userId: 'user-uuid-1' },
      ip: '10.0.0.1',
    });
    expect(tracker).toBe('user:user-uuid-1');
  });

  it('falls back to sub when only sub is present', async () => {
    const tracker = await guard.getTracker({
      user: { sub: 'did:key:z6Mk1' },
      ip: '10.0.0.1',
    });
    expect(tracker).toBe('user:did:key:z6Mk1');
  });

  it('falls back to IP when not authenticated', async () => {
    const tracker = await guard.getTracker({ ip: '198.51.100.7' });
    expect(tracker).toBe('ip:198.51.100.7');
  });
});
