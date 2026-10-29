import type { Request, Response } from 'express';
import {
  clientIpMiddleware,
  createClientIpResolver,
  normalizeIp,
} from '../client-ip';
import { TokenEndpointThrottlerGuard } from '../../oauth/token-throttler.guard';
import { ClientIdThrottlerGuard } from '../../oauth/client-throttler.guard';

/**
 * The client address must never be a header the caller wrote. Before this,
 * guards read the first X-Forwarded-For entry (the caller's choice) and the
 * global throttler read the Traefik container's address (one bucket for
 * everyone).
 */
describe('client IP resolution', () => {
  const resolve = createClientIpResolver();
  const TRAEFIK = '172.18.0.5';
  const CF_EDGE = '162.158.10.20';
  const REAL = '203.0.113.7';

  it('a direct hit on the container port is the socket, whatever headers say', () => {
    expect(
      resolve({
        socketAddress: REAL,
        forwardedFor: '1.1.1.1, 2.2.2.2',
        cfConnectingIp: '9.9.9.9',
      }),
    ).toBe(REAL);
  });

  it('through Cloudflare and Traefik, the edge-set CF-Connecting-IP is the client', () => {
    expect(
      resolve({
        socketAddress: `::ffff:${TRAEFIK}`,
        forwardedFor: `6.6.6.6, ${REAL}, ${CF_EDGE}`,
        cfConnectingIp: REAL,
      }),
    ).toBe(REAL);
  });

  it('a spoofed first X-Forwarded-For entry is never the answer', () => {
    expect(
      resolve({
        socketAddress: TRAEFIK,
        forwardedFor: `6.6.6.6, ${REAL}`,
        cfConnectingIp: undefined,
      }),
    ).toBe(REAL);
  });

  it('a public non-Cloudflare hop stops the walk even if it forged CF-Connecting-IP', () => {
    // Attacker talks to Traefik directly, bypassing Cloudflare.
    expect(
      resolve({
        socketAddress: TRAEFIK,
        forwardedFor: `${CF_EDGE}, ${REAL}`,
        cfConnectingIp: '6.6.6.6',
      }),
    ).toBe(REAL);
  });

  it('two different users behind Traefik get two different addresses', () => {
    const a = resolve({ socketAddress: TRAEFIK, forwardedFor: '198.51.100.1', cfConnectingIp: undefined });
    const b = resolve({ socketAddress: TRAEFIK, forwardedFor: '198.51.100.2', cfConnectingIp: undefined });
    expect(a).not.toBe(b);
    expect(a).not.toBe(TRAEFIK);
  });

  it('garbage in a header stops at the last known address', () => {
    expect(
      resolve({ socketAddress: TRAEFIK, forwardedFor: 'not-an-ip', cfConnectingIp: undefined }),
    ).toBe(TRAEFIK);
  });

  it('local health checks resolve to loopback', () => {
    expect(resolve({ socketAddress: '127.0.0.1', forwardedFor: undefined, cfConnectingIp: undefined })).toBe('127.0.0.1');
  });

  it('honours extra trusted proxies and a replacement Cloudflare list', () => {
    const r = createClientIpResolver({ trustedProxies: '198.18.0.0/15', cloudflareIps: '192.0.2.0/24' });
    expect(r({ socketAddress: '198.18.0.1', forwardedFor: '192.0.2.9', cfConnectingIp: REAL })).toBe(REAL);
    // The default Cloudflare list no longer applies.
    expect(r({ socketAddress: TRAEFIK, forwardedFor: CF_EDGE, cfConnectingIp: REAL })).toBe(CF_EDGE);
  });

  it('normalizeIp unwraps v4-mapped v6 and rejects junk', () => {
    expect(normalizeIp('::ffff:10.0.0.1')).toBe('10.0.0.1');
    expect(normalizeIp('[2001:db8::1]')).toBe('2001:db8::1');
    expect(normalizeIp('evil')).toBeNull();
  });

  it('the middleware makes req.ip the resolved address', () => {
    const req = {
      socket: { remoteAddress: TRAEFIK },
      headers: { 'x-forwarded-for': `6.6.6.6, ${REAL}` },
    } as unknown as Request;
    const next = jest.fn();
    clientIpMiddleware()(req, {} as Response, next);
    expect(req.ip).toBe(REAL);
    expect(next).toHaveBeenCalled();
  });

  it('throttler trackers key on req.ip, not on X-Forwarded-For', async () => {
    const req = {
      ip: REAL,
      headers: { 'x-forwarded-for': '6.6.6.6' },
      body: {},
    } as unknown as Request;
    const token = Object.create(TokenEndpointThrottlerGuard.prototype) as TokenEndpointThrottlerGuard;
    const client = Object.create(ClientIdThrottlerGuard.prototype) as ClientIdThrottlerGuard;
    await expect(
      (token as unknown as { getTracker(r: Request): Promise<string> }).getTracker(req),
    ).resolves.toBe(`oauth:token:user:${REAL}`);
    await expect(
      (client as unknown as { getTracker(r: Request): Promise<string> }).getTracker(req),
    ).resolves.toBe(`oauth:ip:${REAL}`);
  });
});
