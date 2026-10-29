import { BlockList, isIP } from 'node:net';
import type { Request, Response, NextFunction } from 'express';

/**
 * The one answer to "which address is this request from".
 *
 * Every rate limit, flood guard and audit row keys on it, so it must not be
 * something the caller writes. Reading the first `X-Forwarded-For` entry (what
 * the guards used to do) is exactly that: a client sends
 * `X-Forwarded-For: 1.2.3.4`, Cloudflare and Traefik append to it, and the
 * first entry stays the client's choice. Hitting the published container port
 * directly skips even the appending. Meanwhile `req.ip` without a proxy
 * setting is the Traefik container, so every user behind Traefik shared one
 * bucket and one caller could exhaust it for all of them.
 *
 * The walk here goes from the socket leftwards through `X-Forwarded-For`,
 * past hops we trust (private networks: Traefik, the docker bridge), and
 * stops at the first one we do not:
 *   - a public socket (a direct hit on the container port) is the client;
 *   - a Cloudflare edge vouches for `CF-Connecting-IP`, which Cloudflare
 *     always overwrites, so a client cannot choose it through the edge;
 *   - any other public hop is the client.
 * A header a client wrote can never be reached without passing through an
 * untrusted hop first, so it is never the answer.
 */

/** Private and local ranges: the reverse proxy and the docker networks. */
const PRIVATE_V4 = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
] as const;
const PRIVATE_V6 = [
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
] as const;

/**
 * Cloudflare's published edge ranges (https://www.cloudflare.com/ips-v4,
 * https://www.cloudflare.com/ips-v6). They change rarely; `CLOUDFLARE_IPS`
 * (comma-separated CIDRs) replaces the list without a release.
 */
const CLOUDFLARE_DEFAULT = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

function addCidr(list: BlockList, cidr: string): void {
  const [net = '', bits] = cidr.trim().split('/');
  const family = isIP(net);
  const prefix = Number(bits);
  if (!family || !Number.isInteger(prefix)) return;
  list.addSubnet(net, prefix, family === 6 ? 'ipv6' : 'ipv4');
}

function buildPrivate(extra: string): BlockList {
  const list = new BlockList();
  for (const [net, bits] of PRIVATE_V4) list.addSubnet(net, bits, 'ipv4');
  for (const [net, bits] of PRIVATE_V6) list.addSubnet(net, bits, 'ipv6');
  for (const cidr of extra.split(',').filter(Boolean)) addCidr(list, cidr);
  return list;
}

function buildCloudflare(override: string): BlockList {
  const list = new BlockList();
  const cidrs = override.trim()
    ? override.split(',').filter(Boolean)
    : CLOUDFLARE_DEFAULT;
  for (const cidr of cidrs) addCidr(list, cidr);
  return list;
}

/** `::ffff:1.2.3.4` → `1.2.3.4`; anything that is not an address → null. */
export function normalizeIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (ip.startsWith('[') && ip.includes(']')) ip = ip.slice(1, ip.indexOf(']'));
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped?.[1]) ip = mapped[1];
  return isIP(ip) ? ip : null;
}

function check(list: BlockList, ip: string): boolean {
  return list.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');
}

export interface ClientIpConfig {
  /** Extra CIDRs to treat as our own proxies (comma-separated). */
  trustedProxies?: string;
  /** Replacement for the Cloudflare edge list (comma-separated). */
  cloudflareIps?: string;
}

/** Reads TRUSTED_PROXY_CIDRS and CLOUDFLARE_IPS from config. */
export function clientIpConfig(get: (key: string) => string | undefined): ClientIpConfig {
  return {
    trustedProxies: get('TRUSTED_PROXY_CIDRS') ?? '',
    cloudflareIps: get('CLOUDFLARE_IPS') ?? '',
  };
}

export interface ClientIpInput {
  socketAddress: string | undefined;
  forwardedFor: string | string[] | undefined;
  cfConnectingIp: string | string[] | undefined;
}

export function createClientIpResolver(config: ClientIpConfig = {}) {
  const ours = buildPrivate(config.trustedProxies ?? '');
  const cloudflare = buildCloudflare(config.cloudflareIps ?? '');

  return function resolve(input: ClientIpInput): string {
    const socket = normalizeIp(input.socketAddress);
    if (!socket) return 'unknown';

    const fwdHeader = Array.isArray(input.forwardedFor)
      ? input.forwardedFor.join(',')
      : (input.forwardedFor ?? '');
    const hops = fwdHeader
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean)
      .reverse();
    const cf = normalizeIp(
      Array.isArray(input.cfConnectingIp)
        ? input.cfConnectingIp[0]
        : input.cfConnectingIp,
    );

    // Walk: the socket, then X-Forwarded-For right to left.
    let current = socket;
    let i = 0;
    for (;;) {
      if (check(cloudflare, current)) {
        // The edge overwrites CF-Connecting-IP, so it is the client.
        if (cf) return cf;
      } else if (!check(ours, current)) {
        return current;
      }
      // A hop we trust (or an edge without the header): look one further.
      if (i >= hops.length) return current;
      const next = normalizeIp(hops[i++]);
      // Garbage in a header we would otherwise trust: stop at the last
      // address we actually know.
      if (!next) return current;
      current = next;
    }
  };
}

/**
 * Express middleware: computes the client address once and makes `req.ip`
 * return it, so the throttler's default tracker, the custom guards and the
 * audit rows all read the same, unspoofable value. Mount it first.
 */
export function clientIpMiddleware(config: ClientIpConfig = {}) {
  const resolve = createClientIpResolver(config);
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ip = resolve({
      socketAddress: req.socket?.remoteAddress,
      forwardedFor: req.headers['x-forwarded-for'],
      cfConnectingIp: req.headers['cf-connecting-ip'],
    });
    Object.defineProperty(req, 'ip', {
      value: ip,
      configurable: true,
      enumerable: true,
      writable: false,
    });
    next();
  };
}

/** The client address for guards and audit rows. Never reads headers. */
export function clientIp(req: { ip?: unknown }): string {
  return typeof req.ip === 'string' && req.ip ? req.ip : 'unknown';
}
