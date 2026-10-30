/**
 * The address half of `safeFetch` (./safe-fetch.ts): which IPs and names are
 * not on the public internet, and the checks a URL must pass before any
 * socket opens.
 *
 * Mirrors `@inite/security/server` (inite-shared#62, `safeFetch.ts`) so the
 * two can be swapped once auth-service depends on the package.
 */
import net from 'node:net';

export type BlockedReason =
  | 'protocol'
  | 'port'
  | 'credentials'
  | 'address'
  | 'redirects'
  | 'size'
  | 'timeout'
  | 'content-type'
  | 'url';

export class BlockedFetch extends Error {
  constructor(
    readonly reason: BlockedReason,
    message: string,
  ) {
    super(message);
    this.name = 'BlockedFetch';
  }
}

const V4_BLOCKED: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network", incl. 0.0.0.0
  ['10.0.0.0', 8], // RFC 1918
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. 169.254.169.254 (cloud metadata)
  ['172.16.0.0', 12], // RFC 1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // RFC 1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. broadcast
];

const V6_BLOCKED: ReadonlyArray<readonly [string, number]> = [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['100::', 64], // discard
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique-local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (deprecated)
  ['ff00::', 8], // multicast
];

const BLOCK = new net.BlockList();
for (const [a, p] of V4_BLOCKED) BLOCK.addSubnet(a, p, 'ipv4');
for (const [a, p] of V6_BLOCKED) BLOCK.addSubnet(a, p, 'ipv6');

function hexPairToV4(hi: string, lo: string): string {
  const n = ((parseInt(hi, 16) << 16) | parseInt(lo, 16)) >>> 0;
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/**
 * The IPv4 address an IPv6 form carries, if any: IPv4-mapped (::ffff:a.b.c.d
 * and its hex form ::ffff:7f00:1), NAT64 (64:ff9b::), IPv4-compatible (::a.b.c.d)
 * and 6to4 (2002:AABB:CCDD::).
 */
function embeddedV4(v6: string): string | null {
  const a = v6.toLowerCase();
  const dotted = /^(?:::ffff:|64:ff9b::|::)(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (dotted?.[1]) return dotted[1];
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a);
  if (hex?.[1] && hex[2]) return hexPairToV4(hex[1], hex[2]);
  const sixToFour = /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4}):/.exec(a);
  if (sixToFour?.[1] && sixToFour[2]) return hexPairToV4(sixToFour[1], sixToFour[2]);
  return null;
}

/** True when the address is not on the public internet (or is not an address). */
export function isBlockedAddress(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return BLOCK.check(ip, 'ipv4');
  if (v === 6) {
    const v4 = embeddedV4(ip);
    if (v4) return BLOCK.check(v4, 'ipv4');
    // A mapped/NAT64 prefix we could not decode: refuse rather than guess.
    if (/^::ffff:/i.test(ip) || /^64:ff9b::/i.test(ip)) return true;
    return BLOCK.check(ip, 'ipv6');
  }
  return true;
}

const INTERNAL_NAME = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

export interface UrlPolicy {
  /** Ports a URL may name (default 80 and 443). */
  ports?: number[];
  /** Exact host names (or literal IPs) allowed although they are private. */
  allowPrivateHosts?: string[];
  /** Refuse http: (default: true when NODE_ENV is production). */
  requireHttps?: boolean;
}

function parseUrl(raw: string | URL): URL {
  try {
    return new URL(String(raw));
  } catch {
    throw new BlockedFetch('url', 'not a URL');
  }
}

function checkScheme(u: URL, requireHttps: boolean): void {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new BlockedFetch('protocol', `${u.protocol} is not fetched`);
  }
  if (requireHttps && u.protocol !== 'https:') {
    throw new BlockedFetch('protocol', 'only https is fetched');
  }
}

function checkHost(host: string, allowed: string[]): void {
  if (allowed.includes(host)) return;
  if (net.isIP(host) && isBlockedAddress(host)) {
    throw new BlockedFetch('address', `${host} is not a public address`);
  }
  if (INTERNAL_NAME.test(host)) {
    throw new BlockedFetch('address', `${host} is an internal name`);
  }
}

/**
 * Checks a URL before any socket: scheme, port, credentials, literal IPs and
 * internal names. A name that RESOLVES privately is caught later, at connect
 * time (see guardedLookup in ./safe-fetch.ts).
 */
export function checkUrl(raw: string | URL, o: UrlPolicy = {}): URL {
  const u = parseUrl(raw);
  checkScheme(u, o.requireHttps ?? process.env.NODE_ENV === 'production');
  if (u.username || u.password) {
    throw new BlockedFetch('credentials', 'credentials in the URL');
  }
  const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  if (!(o.ports ?? [80, 443]).includes(port)) {
    throw new BlockedFetch('port', `port ${port} is not fetched`);
  }
  checkHost(u.hostname.replace(/^\[|\]$/g, ''), o.allowPrivateHosts ?? []);
  return u;
}
