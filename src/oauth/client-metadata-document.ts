import { Logger } from '@nestjs/common';
import { OAuthClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BlockedFetch, safeFetch, SafeFetchOptions } from '../common/safe-fetch';
import { dcrSupportedScopes } from './oauth-scopes.registry';
import { MetadataDocumentError } from './contracts/metadata-document.error';

export { MetadataDocumentError };

/**
 * OAuth Client ID Metadata Documents (draft-ietf-oauth-client-id-metadata-document,
 * the client registration MCP 2026-07-28 prefers over RFC 7591 DCR).
 *
 * The client_id IS an https URL; the document at that URL describes the
 * client. Nothing is registered ahead of time: the first /authorize names
 * the URL, we fetch the document, check it and keep a row for it, so the
 * rest of the server (redirect checks, consent, codes, tokens) treats it as
 * any other client. The row is refreshed when the document's cache lifetime
 * runs out.
 *
 * What a document may claim is bounded the way open DCR is: a public client
 * (PKCE, no secret), authorization_code and refresh_token only, the DCR scope
 * allow-list, never first-party - so the person always sees the consent
 * screen with the client's name. The URL is fetched only through safeFetch
 * (https, public addresses, no redirects, small body), because anyone can
 * name any URL.
 */

const MAX_DOCUMENT_BYTES = 16 * 1024;
const FETCH_TIMEOUT_MS = 3000;
const MIN_TTL_MS = 5 * 60 * 1000;
const MAX_TTL_MS = 24 * 3600 * 1000;
const MAX_REDIRECT_URIS = 10;
const MAX_CACHED = 1000;
const ALLOWED_GRANTS = ['authorization_code', 'refresh_token'];
const DEFAULT_SCOPES = ['openid', 'profile', 'email'];

/** A client_id that names a metadata document: https, a path, no fragment or credentials. */
export function isMetadataDocumentClientId(clientId: string | null | undefined): boolean {
  if (typeof clientId !== 'string' || clientId.length > 2048 || !clientId.startsWith('https://')) return false;
  try {
    const url = new URL(clientId);
    return url.pathname !== '/' && !url.hash && !url.username && !url.password && url.href === clientId;
  } catch {
    return false;
  }
}

interface ClientMetadata {
  client_id?: unknown;
  client_name?: unknown;
  client_uri?: unknown;
  logo_uri?: unknown;
  redirect_uris?: unknown;
  grant_types?: unknown;
  scope?: unknown;
  token_endpoint_auth_method?: unknown;
  policy_uri?: unknown;
  tos_uri?: unknown;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const httpsOrNull = (v: unknown): string | null => (typeof v === 'string' && v.startsWith('https://') ? v.slice(0, 2048) : null);

/** A redirect a document may name: https, or a loopback for native apps (RFC 8252 §7.3). */
function validRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(u.hostname);
  } catch {
    return false;
  }
}

/** Cache-Control max-age, clamped: a document is re-read at least daily and at most every 5 minutes. */
function ttlOf(cacheControl: string | string[] | undefined): number {
  const header = Array.isArray(cacheControl) ? cacheControl.join(',') : (cacheControl ?? '');
  const maxAge = /max-age=(\d+)/i.exec(header);
  const ms = maxAge ? Number(maxAge[1]) * 1000 : MIN_TTL_MS;
  return Math.min(Math.max(ms, MIN_TTL_MS), MAX_TTL_MS);
}

function checkIdentity(clientId: string, doc: ClientMetadata): void {
  if (doc.client_id !== clientId) throw new MetadataDocumentError('client_id in the document does not match its URL');
  const method = doc.token_endpoint_auth_method ?? 'none';
  if (method !== 'none') throw new MetadataDocumentError('only public clients (token_endpoint_auth_method "none") may use a metadata document');
}

function redirectsOf(doc: ClientMetadata): string[] {
  const uris = strings(doc.redirect_uris);
  if (uris.length === 0 || uris.length > MAX_REDIRECT_URIS || !uris.every(validRedirect)) {
    throw new MetadataDocumentError('redirect_uris must list 1-10 https or loopback URLs');
  }
  return uris;
}

function grantsOf(doc: ClientMetadata): string[] {
  const asked = strings(doc.grant_types);
  const grants = asked.length ? asked.filter((g) => ALLOWED_GRANTS.includes(g)) : [...ALLOWED_GRANTS];
  if (!grants.includes('authorization_code')) throw new MetadataDocumentError('grant_types must include authorization_code');
  return [...new Set(grants)];
}

/** Only what open registration may ask for (oauth-scopes.registry.ts). */
function scopesOf(doc: ClientMetadata): string[] {
  const supported = new Set(dcrSupportedScopes());
  const scopes = typeof doc.scope === 'string' ? doc.scope.split(/\s+/).filter((s) => supported.has(s)) : [];
  return scopes.length ? [...new Set(scopes)] : DEFAULT_SCOPES;
}

function nameOf(clientId: string, doc: ClientMetadata): string {
  const name = typeof doc.client_name === 'string' ? doc.client_name.trim() : '';
  return name ? name.slice(0, 120) : new URL(clientId).host;
}

/** The row a checked document becomes. Throws MetadataDocumentError with the reason. */
export function rowFromDocument(clientId: string, doc: ClientMetadata) {
  checkIdentity(clientId, doc);
  return {
    name: nameOf(clientId, doc),
    redirectUris: redirectsOf(doc),
    allowedGrants: grantsOf(doc),
    allowedScopes: scopesOf(doc),
    isPublic: true,
    tokenEndpointAuthMethod: 'none',
    active: true,
    firstParty: false,
    logoUrl: httpsOrNull(doc.logo_uri),
    privacyPolicyUrl: httpsOrNull(doc.policy_uri),
    termsOfServiceUrl: httpsOrNull(doc.tos_uri),
  };
}

export class ClientMetadataDocuments {
  private readonly logger = new Logger(ClientMetadataDocuments.name);
  /** client_id URL -> when its row must be re-read from the document. */
  private readonly freshUntil = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly fetchOptions: Partial<SafeFetchOptions> = {},
  ) {}

  /**
   * Make sure the row for this client_id reflects its current document.
   * A fetch that fails keeps a row still within its lifetime; past it, the
   * client is refused rather than served from a stale document.
   */
  async ensure(clientId: string): Promise<OAuthClient | null> {
    const until = this.freshUntil.get(clientId);
    if (until && until > Date.now()) return null; // the caller reads the row
    const doc = await this.fetchDocument(clientId);
    const row = rowFromDocument(clientId, doc.body);
    const existing = await this.prisma.oAuthClient.findUnique({ where: { clientId } });
    const client = existing
      ? await this.prisma.oAuthClient.update({ where: { clientId }, data: row })
      : await this.prisma.oAuthClient.create({
          // A public client authenticates by PKCE: the stored hash opens nothing.
          data: { clientId, clientSecretHash: await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 10), ...row },
        });
    if (this.freshUntil.size >= MAX_CACHED) {
      const oldest = this.freshUntil.keys().next().value;
      if (oldest !== undefined) this.freshUntil.delete(oldest);
    }
    this.freshUntil.set(clientId, Date.now() + doc.ttlMs);
    return client;
  }

  private async fetchDocument(clientId: string): Promise<{ body: ClientMetadata; ttlMs: number }> {
    try {
      const res = await safeFetch(clientId, {
        requireHttps: true,
        maxRedirects: 0,
        maxBytes: MAX_DOCUMENT_BYTES,
        timeoutMs: FETCH_TIMEOUT_MS,
        json: true,
        headers: { Accept: 'application/json' },
        ...this.fetchOptions,
      });
      if (res.status !== 200) throw new MetadataDocumentError(`the document answered HTTP ${res.status}`);
      const body = res.json<ClientMetadata>();
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MetadataDocumentError('the document is not a JSON object');
      return { body, ttlMs: ttlOf(res.headers['cache-control']) };
    } catch (err) {
      if (err instanceof MetadataDocumentError) throw err;
      const why = err instanceof BlockedFetch ? err.message : 'could not be fetched';
      this.logger.warn(`client metadata document refused: ${why}`);
      throw new MetadataDocumentError(`the client metadata document ${why}`);
    }
  }
}
