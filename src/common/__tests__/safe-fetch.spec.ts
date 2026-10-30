import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LookupAddress } from 'node:dns';
import { BlockedFetch, checkUrl, isBlockedAddress, safeFetch, Resolve } from '../safe-fetch';

/**
 * The SSRF guard on outbound fetches of client-chosen URLs. A local http
 * server stands in for the far side; an injected resolver plays DNS, so a
 * name can "resolve" to 127.0.0.1 or 10.0.0.5 without touching real DNS.
 */

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

interface Far {
  port: number;
  hits: string[];
  close(): Promise<void>;
}

async function farSide(handler: Handler): Promise<Far> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    handler(req, res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    hits,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

/** A resolver from a fixed table; unknown names fail like NXDOMAIN. */
function dnsTable(table: Record<string, string[]>): Resolve {
  return (hostname) => {
    const addrs = table[hostname];
    if (!addrs) return Promise.reject(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }));
    return Promise.resolve(addrs.map((address): LookupAddress => ({ address, family: address.includes(':') ? 6 : 4 })));
  };
}

async function refusal(p: Promise<unknown>): Promise<BlockedFetch> {
  try {
    await p;
  } catch (err) {
    if (err instanceof BlockedFetch) return err;
    throw err;
  }
  throw new Error('expected the fetch to be refused');
}

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '127.1.2.3',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '64:ff9b::a9fe:a9fe',
    '2002:7f00:1::1',
    'not-an-ip',
  ])('refuses %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe('checkUrl', () => {
  it.each([
    ['https://169.254.169.254/latest/meta-data/', 'address'],
    ['https://127.0.0.1/jwks', 'address'],
    ['https://[::1]/jwks', 'address'],
    ['https://[::ffff:127.0.0.1]/jwks', 'address'],
    ['https://0.0.0.0/jwks', 'address'],
    ['https://localhost/jwks', 'address'],
    ['https://metadata.google.internal/computeMetadata/v1/', 'address'],
    ['https://user:pw@keys.example.com/jwks', 'credentials'],
    ['https://keys.example.com:6379/jwks', 'port'],
    ['file:///etc/passwd', 'protocol'],
    ['gopher://keys.example.com/', 'protocol'],
    ['not a url', 'url'],
  ])('refuses %s (%s)', (url, reason) => {
    expect(() => checkUrl(url)).toThrow(BlockedFetch);
    try {
      checkUrl(url);
    } catch (err) {
      expect((err as BlockedFetch).reason).toBe(reason);
    }
  });

  it('accepts a public https URL', () => {
    expect(checkUrl('https://keys.example.com/.well-known/jwks.json').hostname).toBe('keys.example.com');
  });

  it('refuses http in production and allows it elsewhere', () => {
    const was = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(() => checkUrl('http://keys.example.com/jwks')).toThrow(/only https/);
      process.env.NODE_ENV = 'development';
      expect(checkUrl('http://keys.example.com/jwks').protocol).toBe('http:');
    } finally {
      process.env.NODE_ENV = was;
    }
  });
});

describe('safeFetch', () => {
  let far: Far | undefined;
  afterEach(async () => {
    await far?.close();
    far = undefined;
  });

  it('refuses a name that resolves to 127.0.0.1, before any request reaches it', async () => {
    far = await farSide((_req, res) => res.end('{}'));
    const err = await refusal(
      safeFetch(`http://keys.evil.test:${far.port}/jwks`, {
        ports: [far.port],
        resolve: dnsTable({ 'keys.evil.test': ['127.0.0.1'] }),
      }),
    );
    expect(err.reason).toBe('address');
    expect(far.hits).toEqual([]);
  });

  it('refuses a name with any private answer among public ones (rebinding)', async () => {
    const err = await refusal(
      safeFetch('http://mixed.test/jwks', {
        resolve: dnsTable({ 'mixed.test': ['93.184.215.14', '10.0.0.5'] }),
      }),
    );
    expect(err.reason).toBe('address');
  });

  it('refuses the metadata address, literal or resolved', async () => {
    expect((await refusal(safeFetch('http://169.254.169.254/latest/meta-data/'))).reason).toBe('address');
    const err = await refusal(
      safeFetch('http://meta.test/latest/meta-data/', {
        resolve: dnsTable({ 'meta.test': ['169.254.169.254'] }),
      }),
    );
    expect(err.reason).toBe('address');
  });

  it('refuses a POST to a private address (back-channel logout)', async () => {
    const err = await refusal(
      safeFetch('http://rp.test/logout', {
        method: 'POST',
        body: 'logout_token=x',
        maxRedirects: 0,
        resolve: dnsTable({ 'rp.test': ['192.168.0.10'] }),
      }),
    );
    expect(err.reason).toBe('address');
  });

  it('re-checks a redirect hop: a redirect to the metadata address is refused', async () => {
    far = await farSide((_req, res) => {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/iam/' });
      res.end();
    });
    const err = await refusal(
      safeFetch(`http://public.test:${far.port}/jwks`, {
        ports: [far.port, 80],
        allowPrivateHosts: ['public.test'],
        resolve: dnsTable({ 'public.test': ['127.0.0.1'] }),
      }),
    );
    expect(err.reason).toBe('address');
    expect(far.hits).toEqual(['GET /jwks']);
  });

  it('re-checks a redirect hop: a redirect to a name resolving privately is refused', async () => {
    far = await farSide((_req, res) => {
      res.writeHead(307, { location: `http://internal.test:${far!.port}/admin` });
      res.end();
    });
    const err = await refusal(
      safeFetch(`http://public.test:${far.port}/jwks`, {
        ports: [far.port],
        allowPrivateHosts: ['public.test'],
        resolve: dnsTable({ 'public.test': ['127.0.0.1'], 'internal.test': ['10.0.0.5'] }),
      }),
    );
    expect(err.reason).toBe('address');
    expect(far.hits).toEqual(['GET /jwks']);
  });

  it('refuses any redirect when maxRedirects is 0', async () => {
    far = await farSide((_req, res) => {
      res.writeHead(302, { location: '/elsewhere' });
      res.end();
    });
    const err = await refusal(
      safeFetch(`http://public.test:${far.port}/jwks`, {
        ports: [far.port],
        maxRedirects: 0,
        allowPrivateHosts: ['public.test'],
        resolve: dnsTable({ 'public.test': ['127.0.0.1'] }),
      }),
    );
    expect(err.reason).toBe('redirects');
  });

  it.each([
    ['declared', true],
    ['streamed', false],
  ])('cuts an oversize body (%s length)', async (_label, declared) => {
    const big = Buffer.alloc(256 * 1024, 'a');
    far = await farSide((_req, res) => {
      if (declared) res.setHeader('content-length', String(big.length));
      res.end(big);
    });
    const err = await refusal(
      safeFetch(`http://public.test:${far.port}/jwks`, {
        ports: [far.port],
        maxBytes: 1024,
        allowPrivateHosts: ['public.test'],
        resolve: dnsTable({ 'public.test': ['127.0.0.1'] }),
      }),
    );
    expect(err.reason).toBe('size');
  });

  it('cuts a slow response at the deadline', async () => {
    far = await farSide(() => {
      /* never answers */
    });
    const started = Date.now();
    const err = await refusal(
      safeFetch(`http://public.test:${far.port}/jwks`, {
        ports: [far.port],
        timeoutMs: 200,
        allowPrivateHosts: ['public.test'],
        resolve: dnsTable({ 'public.test': ['127.0.0.1'] }),
      }),
    );
    expect(err.reason).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('refuses http in production', async () => {
    const was = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const err = await refusal(
        safeFetch('http://keys.example.com/jwks', { resolve: dnsTable({ 'keys.example.com': ['93.184.215.14'] }) }),
      );
      expect(err.reason).toBe('protocol');
    } finally {
      process.env.NODE_ENV = was;
    }
  });

  it('ignores OUTBOUND_ALLOW_PRIVATE_HOSTS in production', async () => {
    const env = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.OUTBOUND_ALLOW_PRIVATE_HOSTS = 'rp.test';
    try {
      const err = await refusal(
        safeFetch('https://rp.test/logout', { resolve: dnsTable({ 'rp.test': ['127.0.0.1'] }) }),
      );
      expect(err.reason).toBe('address');
    } finally {
      process.env = env;
    }
  });

  it('refuses a non-JSON reply when JSON is expected', async () => {
    far = await farSide((_req, res) => {
      res.setHeader('content-type', 'text/html');
      res.end('<html>login</html>');
    });
    const err = await refusal(
      safeFetch(`http://public.test:${far.port}/jwks`, {
        ports: [far.port],
        json: true,
        allowPrivateHosts: ['public.test'],
        resolve: dnsTable({ 'public.test': ['127.0.0.1'] }),
      }),
    );
    expect(err.reason).toBe('content-type');
  });

  it('loads a JWKS from an allowed host, following one checked redirect', async () => {
    far = await farSide((req, res) => {
      if (req.url === '/old') {
        res.writeHead(301, { location: '/.well-known/jwks.json' });
        res.end();
        return;
      }
      res.setHeader('content-type', 'application/jwk-set+json');
      res.end(JSON.stringify({ keys: [{ kty: 'EC', crv: 'P-256', x: 'x', y: 'y' }] }));
    });
    const res = await safeFetch(`http://public.test:${far.port}/old`, {
      ports: [far.port],
      json: true,
      allowPrivateHosts: ['public.test'],
      resolve: dnsTable({ 'public.test': ['127.0.0.1'] }),
    });
    expect(res.status).toBe(200);
    expect(res.url).toBe(`http://public.test:${far.port}/.well-known/jwks.json`);
    expect(res.json<{ keys: unknown[] }>().keys).toHaveLength(1);
    expect(far.hits).toEqual(['GET /old', 'GET /.well-known/jwks.json']);
  });
});
