/**
 * Outbound fetch of a URL a client chose (a registered `jwks_uri`, a
 * `backchannel_logout_uri`), held so it cannot be turned on our own network:
 *
 *   - http(s) only, https only in production, ports 80/443 by default, no
 *     credentials in the URL;
 *   - every address the name resolves to is checked AT CONNECT TIME, inside
 *     the socket's own lookup, so the address that was checked is the one the
 *     socket connects to (a name that answers public first and private second,
 *     DNS rebinding, is refused on the connection that matters);
 *   - loopback, RFC 1918, link-local (169.254.169.254, the metadata door),
 *     CGNAT, unique-local IPv6, multicast, documentation ranges, 0.0.0.0 and
 *     the mapped/NAT64/6to4 forms of those are refused, literal or resolved;
 *   - redirects are followed by hand, at most `maxRedirects`, each hop checked
 *     again; a body past `maxBytes` and a fetch past `timeoutMs` are cut;
 *   - no proxy from the environment, no cookies, no keep-alive reuse.
 *
 * This is a local copy of `safeFetch` from `@inite/security/server`
 * (inite-shared#62) with the same API and semantics, plus `requireHttps`,
 * `json` and an injectable `resolve` for tests. Swap it for the package once
 * auth-service depends on inite-shared.
 */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockedFetch, checkUrl, isBlockedAddress, UrlPolicy } from './safe-fetch-address';

export { BlockedFetch, checkUrl, isBlockedAddress } from './safe-fetch-address';

export type Resolve = (hostname: string) => Promise<dns.LookupAddress[]>;

export interface SafeFetchOptions extends UrlPolicy {
  method?: 'GET' | 'HEAD' | 'POST';
  headers?: Record<string, string>;
  body?: string | Buffer;
  /** Largest body read, in bytes (default 5 MiB). */
  maxBytes?: number;
  /** Whole fetch, all hops included (default 10 s). */
  timeoutMs?: number;
  /** Redirect hops followed, each re-checked (default 3; 0 refuses any). */
  maxRedirects?: number;
  /** Refuse a final response whose Content-Type is set and is not JSON. */
  json?: boolean;
  signal?: AbortSignal;
  /** Name resolution (default dns.lookup, all addresses). For tests. */
  resolve?: Resolve;
}

export interface SafeResponse {
  status: number;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  text(): string;
  json<T = unknown>(): T;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

const systemResolve: Resolve = (hostname) =>
  dns.promises.lookup(hostname, { all: true });

/**
 * Exact host names that may resolve privately, from OUTBOUND_ALLOW_PRIVATE_HOSTS
 * (comma-separated). Honoured only outside production, so a local RP on
 * localhost can receive a back-channel logout in development.
 */
function envAllowedPrivateHosts(): string[] {
  if (process.env.NODE_ENV === 'production') return [];
  return (process.env.OUTBOUND_ALLOW_PRIVATE_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

type LookupCb = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

/** A socket lookup that refuses a name resolving to any non-public address. */
export function guardedLookup(allowPrivate: (host: string) => boolean, resolve: Resolve = systemResolve) {
  return (hostname: string, options: dns.LookupOptions, cb: LookupCb): void => {
    resolve(hostname).then(
      (all) => {
        const family = options.family === 4 || options.family === 6 ? options.family : 0;
        const list = family ? all.filter((a) => a.family === family) : all;
        const first = list[0];
        if (!first || (!allowPrivate(hostname) && list.some((a) => isBlockedAddress(a.address)))) {
          const e = new BlockedFetch('address', `${hostname} resolves to a non-public address`);
          cb(e as unknown as NodeJS.ErrnoException, '');
          return;
        }
        if (options.all) cb(null, list);
        else cb(null, first.address, first.family);
      },
      (err: NodeJS.ErrnoException) => cb(err, ''),
    );
  };
}

interface Raw {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

function readCapped(res: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (Number(res.headers['content-length'] ?? 0) > maxBytes) {
      res.destroy();
      reject(new BlockedFetch('size', `body over ${maxBytes} bytes`));
      return;
    }
    const chunks: Buffer[] = [];
    let n = 0;
    res.on('data', (c: Buffer) => {
      n += c.length;
      if (n > maxBytes) {
        res.destroy();
        reject(new BlockedFetch('size', `body over ${maxBytes} bytes`));
      } else chunks.push(c);
    });
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', reject);
    res.on('close', () => reject(new BlockedFetch('timeout', 'connection closed before the body ended')));
  });
}

function once(u: URL, o: SafeFetchOptions, deadline: number): Promise<Raw> {
  const lib = u.protocol === 'https:' ? https : http;
  const allowed = o.allowPrivateHosts ?? [];
  return new Promise((resolve, reject) => {
    const left = deadline - Date.now();
    if (left <= 0) return reject(new BlockedFetch('timeout', 'deadline passed'));
    const req = lib.request(u, {
      method: o.method ?? 'GET',
      headers: { 'user-agent': 'inite-auth-service', accept: '*/*', ...o.headers },
      lookup: guardedLookup((h) => allowed.includes(h), o.resolve) as unknown as typeof dns.lookup,
      agent: false,
      signal: o.signal,
    });
    const timer = setTimeout(
      () => req.destroy(new BlockedFetch('timeout', `no answer in ${o.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms`)),
      left,
    );
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.on('response', (res) => {
      readCapped(res, o.maxBytes ?? DEFAULT_MAX_BYTES).then(
        (body) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        reject,
      );
    });
    req.end(o.body);
  });
}

function assertJson(r: Raw): void {
  const type = r.headers['content-type'];
  if (type && !/[/+]json\b/i.test(type)) {
    throw new BlockedFetch('content-type', `expected JSON, got ${type.split(';')[0]}`);
  }
}

function respond(u: URL, r: Raw): SafeResponse {
  return {
    status: r.status,
    url: u.toString(),
    headers: r.headers,
    body: r.body,
    text: () => r.body.toString('utf8'),
    json: <T>() => JSON.parse(r.body.toString('utf8')) as T,
  };
}

/** Where a redirect points, or null when `r` is not a redirect. */
function redirectTarget(r: Raw): string | null {
  const loc = r.headers.location;
  return r.status >= 300 && r.status < 400 && loc ? loc : null;
}

export async function safeFetch(url: string | URL, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  const o: SafeFetchOptions = {
    ...options,
    allowPrivateHosts: options.allowPrivateHosts ?? envAllowedPrivateHosts(),
  };
  const deadline = Date.now() + (o.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxRedirects = o.maxRedirects ?? 3;
  let u = checkUrl(url, o);
  let hopOpts = o;
  for (let hop = 0; ; hop++) {
    const r = await once(u, hopOpts, deadline);
    const loc = redirectTarget(r);
    if (!loc) {
      if (o.json) assertJson(r);
      return respond(u, r);
    }
    if (hop >= maxRedirects) throw new BlockedFetch('redirects', `more than ${maxRedirects} redirects`);
    u = checkUrl(new URL(loc, u), o);
    // 301-303 turn a POST into a GET without a body, as browsers do.
    if (r.status !== 307 && r.status !== 308) hopOpts = { ...hopOpts, method: 'GET', body: undefined };
  }
}
