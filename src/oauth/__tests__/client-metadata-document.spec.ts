import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LookupAddress } from 'node:dns';
import { UnauthorizedException } from '@nestjs/common';
import {
  ClientMetadataDocuments,
  isMetadataDocumentClientId,
  MetadataDocumentError,
  rowFromDocument,
} from '../client-metadata-document';
import { OAuthClientRegistryService } from '../oauth-client-registry.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { Resolve } from '../../common/safe-fetch';

/**
 * Client ID Metadata Documents: anyone can name any URL as a client_id, so
 * what the document may claim is bounded like open DCR (public, PKCE, never
 * first-party, the DCR scopes) and the URL is fetched only through safeFetch.
 */

const dns = (table: Record<string, string>): Resolve => (hostname) =>
  table[hostname]
    ? Promise.resolve([{ address: table[hostname], family: 4 } as LookupAddress])
    : Promise.reject(new Error(`ENOTFOUND ${hostname}`));

/** Prisma's oAuthClient, in memory. */
function fakePrisma() {
  const rows = new Map<string, Record<string, unknown>>();
  const oAuthClient = {
    findUnique: jest.fn(({ where }) => Promise.resolve(rows.get(where.clientId) ?? null)),
    findFirst: jest.fn(({ where }) => Promise.resolve(rows.get(where.clientId) ?? null)),
    create: jest.fn(({ data }) => {
      rows.set(data.clientId, { ...data });
      return Promise.resolve(rows.get(data.clientId));
    }),
    update: jest.fn(({ where, data }) => {
      rows.set(where.clientId, { ...rows.get(where.clientId), ...data });
      return Promise.resolve(rows.get(where.clientId));
    }),
  };
  return { prisma: { oAuthClient } as unknown as PrismaService, rows, oAuthClient };
}

describe('which client_ids name a metadata document', () => {
  it.each([
    ['https://app.example.com/oauth/client.json', true],
    ['https://app.example.com/', false],
    ['http://app.example.com/client.json', false],
    ['https://user:pw@app.example.com/c.json', false],
    ['https://app.example.com/c.json#x', false],
    ['dcr_0123', false],
    ['smart-chat', false],
  ])('%s → %s', (id, expected) => {
    expect(isMetadataDocumentClientId(id)).toBe(expected);
  });
});

describe('what a document may claim', () => {
  const id = 'https://app.example.com/client.json';
  const good = { client_id: id, client_name: 'Example', redirect_uris: ['https://app.example.com/cb'] };

  it('becomes a public, never first-party client with the DCR scopes only', () => {
    const row = rowFromDocument(id, { ...good, scope: 'openid break3:read brain:admin', grant_types: ['authorization_code', 'client_credentials'] });
    expect(row).toMatchObject({ isPublic: true, tokenEndpointAuthMethod: 'none', firstParty: false });
    expect(row.allowedScopes).toEqual(['openid', 'break3:read']);
    expect(row.allowedGrants).toEqual(['authorization_code']);
  });

  it('refuses a document that names another client_id', () => {
    expect(() => rowFromDocument(id, { ...good, client_id: 'https://evil.example/client.json' })).toThrow(MetadataDocumentError);
  });

  it('refuses a confidential client', () => {
    expect(() => rowFromDocument(id, { ...good, token_endpoint_auth_method: 'client_secret_post' })).toThrow(/public clients/);
  });

  it.each([[[]], [['javascript:alert(1)']], [['http://app.example.com/cb']], [['https://app.example.com/cb#frag']]])(
    'refuses redirect_uris %j',
    (redirect_uris) => {
      expect(() => rowFromDocument(id, { ...good, redirect_uris })).toThrow(/redirect_uris/);
    },
  );

  it('allows a loopback redirect for native apps', () => {
    expect(rowFromDocument(id, { ...good, redirect_uris: ['http://127.0.0.1:8123/cb'] }).redirectUris).toEqual(['http://127.0.0.1:8123/cb']);
  });
});

describe('fetching the document', () => {
  let server: http.Server;
  let port: number;
  let hits: number;
  let body: unknown;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      hits++;
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'max-age=600');
      res.end(JSON.stringify(body));
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

  // Plain http and an allowed private name only because the stand-in host is local.
  const local = () => ({ requireHttps: false, ports: [port], allowPrivateHosts: ['client.test'], resolve: dns({ 'client.test': '127.0.0.1' }) });

  it('creates the row once and serves it from the row until the document expires', async () => {
    const id = `http://client.test:${port}/client.json`;
    body = { client_id: id, client_name: 'Local', redirect_uris: ['https://client.test/cb'] };
    const { prisma, rows } = fakePrisma();
    const docs = new ClientMetadataDocuments(prisma, local());
    await docs.ensure(id);
    await docs.ensure(id);
    expect(hits).toBe(1);
    expect(rows.get(id)).toMatchObject({ name: 'Local', isPublic: true });
  });

  it('never reaches a private address', async () => {
    const { prisma } = fakePrisma();
    const docs = new ClientMetadataDocuments(prisma, { ports: [443, port], resolve: dns({ 'client.test': '127.0.0.1' }) });
    await expect(docs.ensure(`https://client.test:${port}/client.json`)).rejects.toThrow(MetadataDocumentError);
    await expect(docs.ensure('https://169.254.169.254/latest/meta-data/')).rejects.toThrow(MetadataDocumentError);
    expect(hits).toBe(0);
  });

  it('turns a bad document into "Invalid client" at validateClient', async () => {
    const { prisma } = fakePrisma();
    const registry = new OAuthClientRegistryService(prisma, { ports: [443], resolve: dns({ 'app.example.com': '127.0.0.1' }) });
    await expect(registry.validateClient('https://app.example.com/client.json')).rejects.toThrow(UnauthorizedException);
  });
});
