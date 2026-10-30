import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LookupAddress } from 'node:dns';
import { UnauthorizedException } from '@nestjs/common';
import { OAuthClient } from '@prisma/client';
import * as jose from 'jose';
import { ClientJwksService } from '../client-jwks.service';
import type { Resolve } from '../../common/safe-fetch';

/**
 * A client's jwks_uri is a URL the client chose (DCR lets anyone register
 * one), so the key fetch must never reach our own network. The resolver is
 * injected; a local server stands in for the client's key host.
 */

function dnsTable(table: Record<string, string>): Resolve {
  return (hostname) => {
    const address = table[hostname];
    if (!address) return Promise.reject(new Error(`ENOTFOUND ${hostname}`));
    return Promise.resolve([{ address, family: 4 } as LookupAddress]);
  };
}

const clientWith = (jwksUri: string): OAuthClient => ({ clientId: 'c1', jwks: null, jwksUri }) as unknown as OAuthClient;

describe('ClientJwksService', () => {
  let priv: jose.CryptoKey;
  let publicJwk: jose.JWK;
  let server: http.Server;
  let port: number;
  let hits: number;

  beforeAll(async () => {
    const kp = await jose.generateKeyPair('ES256', { extractable: true });
    priv = kp.privateKey;
    publicJwk = { ...(await jose.exportJWK(kp.publicKey)), kid: 'k1', alg: 'ES256' };
    server = http.createServer((_req, res) => {
      hits++;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [publicJwk] }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });

  beforeEach(() => {
    hits = 0;
  });

  const assertion = (): Promise<string> =>
    new jose.SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setIssuer('c1').setExpirationTime('1m').sign(priv);

  it('uses an inline JWK Set without fetching', async () => {
    const svc = new ClientJwksService();
    const keySet = svc.resolveKeySet({ jwks: { keys: [publicJwk] }, jwksUri: null } as unknown as OAuthClient);
    await expect(jose.jwtVerify(await assertion(), keySet)).resolves.toBeDefined();
  });

  it.each([
    'https://169.254.169.254/latest/meta-data/',
    'https://127.0.0.1/jwks',
    'https://[::1]/jwks',
    'https://10.0.0.5/jwks',
    'https://localhost/jwks',
    'https://keys.example.com:6379/jwks',
    'http://keys.example.com/jwks',
  ])('refuses a jwks_uri of %s before any fetch', (uri) => {
    expect(() => new ClientJwksService().resolveKeySet(clientWith(uri))).toThrow(UnauthorizedException);
  });

  it('refuses a jwks_uri whose name resolves to 127.0.0.1', async () => {
    const svc = new ClientJwksService({
      ports: [443, port],
      resolve: dnsTable({ 'keys.client.test': '127.0.0.1' }),
    });
    const keySet = svc.resolveKeySet(clientWith(`https://keys.client.test:${port}/jwks`));
    await expect(jose.jwtVerify(await assertion(), keySet)).rejects.toThrow(/non-public address/);
    expect(hits).toBe(0);
  });

  it('loads a legitimate JWKS through the guard and keeps one set per URI', async () => {
    // Plain http and an allowed name only because the stand-in server is local;
    // production fetches https and allows no private host.
    const svc = new ClientJwksService({
      requireHttps: false,
      ports: [port],
      allowPrivateHosts: ['keys.client.test'],
      resolve: dnsTable({ 'keys.client.test': '127.0.0.1' }),
    });
    const client = clientWith(`http://keys.client.test:${port}/jwks`);
    const keySet = svc.resolveKeySet(client);
    const { payload } = await jose.jwtVerify(await assertion(), keySet);
    expect(payload.iss).toBe('c1');
    expect(svc.resolveKeySet(client)).toBe(keySet);
    await jose.jwtVerify(await assertion(), svc.resolveKeySet(client));
    expect(hits).toBe(1);
  });
});
