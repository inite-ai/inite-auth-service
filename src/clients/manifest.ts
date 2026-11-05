/**
 * First-party OAuth clients as code: one `clients/<clientId>.json` per
 * product, reviewed in a PR, applied by `scripts/clients-apply.ts`. Before
 * this, product clients lived only in the prod database, written by hand.
 *
 * A manifest holds only what genuinely differs between products. Everything
 * that is a family convention is derived from the product's origin, with the
 * same paths @inite/auth mounts (inite-shared `packages/auth/src/kit/contract.ts`;
 * a test on each side pins the values):
 *
 *   redirect URI           <origin>/callback            (every origin listed)
 *   back-channel logout    <origin>/api/auth/backchannel-logout   (the first origin)
 *   post-logout redirect   any path on the client's own redirect origins (logout-redirect.ts)
 *   access-token audience  the client id, or an https URL on its own origins
 *                          (an empty allowedAudiences, resource-registry.ts)
 *   scopes                 the OIDC baseline; a manifest adds vertical scopes
 *   grants                 authorization_code + refresh_token
 *   auth method            client_secret_post, confidential, firstParty
 *
 * Overrides exist only for a backend that does not follow the convention
 * (a Nest API on its own host, a Python app with its own callback path, a
 * public PKCE client with no secret) and for redirect URIs still in use
 * during a migration. Each names its reason.
 *
 * A machine client (`"kind": "machine"`) is a backend that calls another
 * service as itself and never signs a person in: no origins, no redirect
 * URIs, no back-channel, grants exactly [client_credentials], scopes and
 * audiences exactly as listed (no OIDC baseline), confidential.
 */

export const CALLBACK_PATH = '/callback';
export const BACKCHANNEL_LOGOUT_PATH = '/api/auth/backchannel-logout';
export const POST_LOGOUT_PATH = '/';
export const BASELINE_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const;
export const DEFAULT_GRANTS = ['authorization_code', 'refresh_token'] as const;
export const MACHINE_GRANTS = ['client_credentials'] as const;
/** Grants a public client cannot hold: each needs a client that can authenticate. */
const CONFIDENTIAL_ONLY_GRANTS = ['client_credentials', 'urn:ietf:params:oauth:grant-type:token-exchange'];

/** Clients the service seeds itself (system-clients.seeder.ts): never in a manifest. */
export const SYSTEM_CLIENT_IDS = new Set(['inite-cli']);

export interface ClientManifest {
  clientId: string;
  name: string;
  /** The GitHub repo whose secret holds this client's secret. Required to create or rotate. */
  repo?: string;
  /**
   * Absent: a product people sign in to (derived from its origins).
   * "machine": a backend calling another service as itself (client_credentials only).
   */
  kind?: 'machine';
  /** The product's public origins. The first one is canonical. Never on a machine client. */
  origins?: string[];
  /** Vertical scopes on top of the baseline (e.g. fund:read). On a machine client: exactly its scopes. */
  scopes?: string[];
  /** Resources this client may bind a token to besides its own id and origins. Required on a machine client. */
  audiences?: string[];
  /** Brain and other horizontal services key M2M data by this. */
  companyId?: string;
  /** How the secret is delivered: the GitHub secret name, and an environment if any. */
  secret?: { name: string; environment?: string };
  /** A host outside FAMILY_DOMAINS, and why. */
  outsideFamily?: string;
  active?: boolean;
  /**
   * Signs in a tenant's own customers (src/oauth/customer-lane.ts): with
   * CUSTOMER_LANE_ENABLED, `organization=<slug>` gives a passwordless person
   * a `customer` membership in that org. Off unless set.
   */
  customerLane?: boolean;
  /** Only where the product does not follow the convention. Each with its reason. */
  overrides?: {
    reason: string;
    /**
     * A public client (RFC 6749 §2.1): no secret, auth method `none`, PKCE
     * only. Never with `secret`, client_credentials or token exchange, and the
     * back-channel must be set to null (a public client is never notified).
     */
    public?: true;
    /** Replaces <origin>/callback for every origin (e.g. "/api/auth/callback"). */
    callbackPath?: string;
    /** Redirect URIs kept in addition, while a product still uses them. */
    extraRedirectUris?: string[];
    /** A back-channel URI on another host (a separate API), or null for none. */
    backchannelLogoutUri?: string | null;
    /** Replaces the default grants. */
    grants?: string[];
    /** Replaces the baseline: exactly these scopes (with openid). Not together with top-level `scopes`. */
    scopes?: string[];
  };
}

/** The OAuthClient columns a manifest decides. */
export interface ClientRow {
  clientId: string;
  name: string;
  redirectUris: string[];
  allowedScopes: string[];
  allowedGrants: string[];
  allowedAudiences: string[];
  backchannelLogoutUri: string | null;
  firstParty: boolean;
  isPublic: boolean;
  tokenEndpointAuthMethod: string;
  companyId: string | null;
  active: boolean;
  customerLane: boolean;
}

export const MANAGED_FIELDS: readonly (keyof ClientRow)[] = [
  'name',
  'redirectUris',
  'allowedScopes',
  'allowedGrants',
  'allowedAudiences',
  'backchannelLogoutUri',
  'firstParty',
  'isPublic',
  'tokenEndpointAuthMethod',
  'companyId',
  'active',
  'customerLane',
];

const uniq = (xs: string[]) => [...new Set(xs)];
const origin = (u: string) => new URL(u).origin;

function backchannelOf(m: ClientManifest, origins: string[]): string | null {
  const o = m.overrides;
  if (o && 'backchannelLogoutUri' in o) return o.backchannelLogoutUri ?? null;
  return origins[0] + BACKCHANNEL_LOGOUT_PATH;
}

function deriveMachine(m: ClientManifest): ClientRow {
  return {
    clientId: m.clientId,
    name: m.name,
    redirectUris: [],
    allowedScopes: uniq(m.scopes ?? []),
    allowedGrants: [...MACHINE_GRANTS],
    allowedAudiences: uniq(m.audiences ?? []),
    backchannelLogoutUri: null,
    firstParty: true,
    isPublic: false,
    tokenEndpointAuthMethod: 'client_secret_post',
    companyId: m.companyId ?? null,
    active: m.active ?? true,
    customerLane: false,
  };
}

/** isPublic and the token-endpoint auth method, which go together. */
const authOf = (isPublic: boolean) => ({ isPublic, tokenEndpointAuthMethod: isPublic ? 'none' : 'client_secret_post' });

/** The row a manifest means. */
export function deriveClient(m: ClientManifest): ClientRow {
  if (m.kind === 'machine') return deriveMachine(m);
  const o: Partial<NonNullable<ClientManifest['overrides']>> = m.overrides ?? {};
  const origins = (m.origins ?? []).map(origin);
  const callback = o.callbackPath ?? CALLBACK_PATH;
  return {
    clientId: m.clientId,
    name: m.name,
    redirectUris: uniq([...origins.map((x) => x + callback), ...(o.extraRedirectUris ?? [])]),
    allowedScopes: uniq(o.scopes ?? [...BASELINE_SCOPES, ...(m.scopes ?? [])]),
    allowedGrants: uniq([...(o.grants ?? DEFAULT_GRANTS)]),
    allowedAudiences: uniq(m.audiences ?? []),
    backchannelLogoutUri: backchannelOf(m, origins),
    firstParty: true,
    ...authOf(o.public === true),
    companyId: m.companyId ?? null,
    active: m.active ?? true,
    customerLane: m.customerLane === true,
  };
}

/**
 * Does this client authenticate with a secret clients-apply mints and
 * delivers? Never for a public client: it is created with an unusable hash
 * (the column is required) and is never rotated.
 */
export function takesSecret(c: Pick<ClientRow, 'isPublic' | 'tokenEndpointAuthMethod'>): boolean {
  return !c.isPublic && c.tokenEndpointAuthMethod !== 'none';
}

/**
 * The back-channel URI to notify for a client at logout: the stored one, else
 * for a first-party confidential client the convention on its first https
 * redirect origin. Self-registered (`dcr_*`) and public clients get none.
 */
export function backchannelUriFor(c: {
  clientId: string;
  firstParty: boolean;
  isPublic: boolean;
  redirectUris: string[];
  backchannelLogoutUri: string | null;
}): string | null {
  if (c.backchannelLogoutUri) return c.backchannelLogoutUri;
  if (!c.firstParty || c.isPublic || c.clientId.startsWith('dcr_')) return null;
  for (const u of c.redirectUris) {
    try {
      const url = new URL(u);
      if (url.protocol === 'https:') return url.origin + BACKCHANNEL_LOGOUT_PATH;
    } catch {
      /* not a URL: skip */
    }
  }
  return null;
}

const ID = /^[a-z0-9][a-z0-9-]{1,62}$/;
const MANIFEST_KEYS = new Set([
  'clientId', 'name', 'repo', 'kind', 'origins', 'scopes', 'audiences', 'companyId',
  'secret', 'outsideFamily', 'active', 'customerLane', 'overrides',
]);
const OVERRIDE_KEYS = new Set(['reason', 'public', 'callbackPath', 'extraRedirectUris', 'backchannelLogoutUri', 'grants', 'scopes']);
const SECRET_KEYS = new Set(['name', 'environment']);
/** Keys a machine manifest may not carry: it has no origins and signs no one in. */
const NOT_ON_MACHINE = ['origins', 'overrides', 'outsideFamily', 'customerLane'] as const;
const REPO = /^inite-ai\/[A-Za-z0-9._-]+$/;
const SCOPE = /^[a-z][a-z0-9_]*(?::[a-z][a-z0-9_]*)?$/;

function idProblems(m: ClientManifest, file: string): string[] {
  const out: string[] = [];
  if (!ID.test(m.clientId ?? '')) out.push('clientId must be lower-case letters, digits and dashes');
  if (file !== `${m.clientId}.json`) out.push(`the file must be named ${m.clientId}.json`);
  if (m.clientId?.startsWith('dcr_')) out.push('a self-registered client is never a manifest');
  if (SYSTEM_CLIENT_IDS.has(m.clientId)) out.push('a system client is seeded by the service, not a manifest');
  if (!m.name) out.push('name is required');
  return out;
}

function unknownKeys(obj: unknown, known: Set<string>, where: string): string[] {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj)
    .filter((k) => !known.has(k))
    .map((k) => `unknown key "${where}${k}"`);
}

function shapeProblems(m: ClientManifest): string[] {
  const out = [...unknownKeys(m, MANIFEST_KEYS, ''), ...unknownKeys(m.overrides, OVERRIDE_KEYS, 'overrides.'), ...unknownKeys(m.secret, SECRET_KEYS, 'secret.')];
  if (m.kind !== undefined && m.kind !== 'machine') out.push('kind is "machine" or absent');
  return out;
}

function identityProblems(m: ClientManifest, file: string): string[] {
  const out = idProblems(m, file);
  if (m.repo !== undefined && !REPO.test(m.repo)) out.push('repo must be inite-ai/<name>');
  if (m.secret && !m.repo) out.push('secret needs the repo it goes to');
  if (m.secret && !/^[A-Z][A-Z0-9_]{2,63}$/.test(m.secret.name ?? '')) out.push('secret.name must be an env-style name');
  return out;
}

function urlProblem(u: string, m: ClientManifest, onFamily: (host: string) => boolean): string | null {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return `${u}: not a URL`;
  }
  if (url.protocol !== 'https:') return `${u}: https only (a loopback URI belongs in a -dev client, never a prod one)`;
  if (url.username || url.password || url.hash) return `${u}: no credentials or fragment`;
  if (!onFamily(url.hostname) && !m.outsideFamily) return `${u}: not on a family domain (name the reason in "outsideFamily")`;
  return null;
}

const familyCheck = (familyDomains: readonly string[]) => (host: string) => familyDomains.some((d) => host === d || host.endsWith(`.${d}`));

function machineProblems(m: ClientManifest, familyDomains: readonly string[]): string[] {
  const out: string[] = NOT_ON_MACHINE.filter((k) => m[k] !== undefined).map((k) => `a machine client has no ${k}`);
  if (!Array.isArray(m.scopes) || m.scopes.length === 0) out.push('a machine client lists its scopes (at least one)');
  if (m.scopes?.some((s) => (BASELINE_SCOPES as readonly string[]).includes(s))) out.push('a machine client signs no one in: no OIDC scopes');
  if (!Array.isArray(m.audiences) || m.audiences.length === 0) out.push('a machine client lists the audiences it may call (at least one)');
  const onFamily = familyCheck(familyDomains);
  for (const a of m.audiences ?? []) {
    const p = urlProblem(a, m, onFamily);
    if (p) out.push(p);
  }
  return out;
}

function urlProblems(m: ClientManifest, familyDomains: readonly string[]): string[] {
  if (!Array.isArray(m.origins) || m.origins.length === 0) return ['origins: at least one'];
  const onFamily = familyCheck(familyDomains);
  const bc = m.overrides?.backchannelLogoutUri;
  const urls = [...m.origins, ...(m.overrides?.extraRedirectUris ?? []), ...(bc ? [bc] : [])];
  const out = urls.map((u) => urlProblem(u, m, onFamily)).filter((p): p is string => p !== null);
  for (const o of m.origins) {
    if (URL.canParse(o) && new URL(o).pathname !== '/') out.push(`${o}: an origin has no path`);
  }
  return out;
}

function publicProblems(m: ClientManifest, row: ClientRow): string[] {
  const o = m.overrides;
  if (o?.public === undefined) return [];
  if (o.public !== true) return ['overrides.public is true or absent'];
  const out: string[] = [];
  if (m.secret) out.push('a public client has no secret to deliver');
  for (const g of row.allowedGrants) if (CONFIDENTIAL_ONLY_GRANTS.includes(g)) out.push(`a public client cannot hold ${g}`);
  if (!('backchannelLogoutUri' in o) || o.backchannelLogoutUri !== null) out.push('a public client gets no back-channel: set overrides.backchannelLogoutUri to null');
  return out;
}

function overrideFieldProblems(m: ClientManifest): string[] {
  const o = m.overrides;
  if (!o) return [];
  const out: string[] = [];
  if (!o.reason || o.reason.trim().length < 8) out.push('overrides need their reason beside them');
  if (o.callbackPath && !o.callbackPath.startsWith('/')) out.push('overrides.callbackPath is a path');
  if (o.scopes && m.scopes) out.push('overrides.scopes replaces the scopes: not together with "scopes"');
  if (o.scopes && !o.scopes.includes('openid')) out.push('overrides.scopes signs a person in: it keeps openid');
  return out;
}

/** Rules on the row the manifest derives (grants and scopes together, public). */
function derivedProblems(m: ClientManifest): string[] {
  let row: ClientRow;
  try {
    row = deriveClient(m);
  } catch {
    return []; // an origin that is not a URL: urlProblems names it
  }
  const out: string[] = [];
  if (row.allowedScopes.includes('offline_access') && !row.allowedGrants.includes('refresh_token')) out.push('offline_access needs the refresh_token grant');
  return [...out, ...publicProblems(m, row)];
}

function overrideProblems(m: ClientManifest): string[] {
  const out = [...(m.scopes ?? []), ...(m.overrides?.scopes ?? [])].filter((s) => !SCOPE.test(s)).map((s) => `scope "${s}" is not a scope name`);
  if (m.kind === 'machine') return out;
  return [...out, ...overrideFieldProblems(m), ...derivedProblems(m)];
}

/** What is wrong with a manifest, as messages ([] when it is fine). */
export function manifestProblems(m: ClientManifest, file: string, familyDomains: readonly string[]): string[] {
  if (!m || typeof m !== 'object') return [`${file}: not an object`];
  const shape = m.kind === 'machine' ? machineProblems(m, familyDomains) : urlProblems(m, familyDomains);
  return [...shapeProblems(m), ...identityProblems(m, file), ...shape, ...overrideProblems(m)].map((p) => `${file}: ${p}`);
}

export interface Plan {
  create: ClientRow[];
  update: { clientId: string; changes: Partial<Record<keyof ClientRow, { from: unknown; to: unknown }>> }[];
  /** In the database, first-party, and in no manifest: reported, never deleted. */
  unmanaged: string[];
}

const same = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b) ? JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()) : a === b;

/** What applying the manifests would change. Read-only. */
export function planApply(wanted: ClientRow[], current: ClientRow[]): Plan {
  const byId = new Map(current.map((r) => [r.clientId, r]));
  const plan: Plan = { create: [], update: [], unmanaged: [] };
  for (const w of wanted) {
    const row = byId.get(w.clientId);
    if (!row) {
      plan.create.push(w);
      continue;
    }
    const changes: Plan['update'][number]['changes'] = {};
    for (const f of MANAGED_FIELDS) if (!same(row[f], w[f])) changes[f] = { from: row[f], to: w[f] };
    if (Object.keys(changes).length) plan.update.push({ clientId: w.clientId, changes });
  }
  const managed = new Set(wanted.map((w) => w.clientId));
  for (const r of current) {
    if (managed.has(r.clientId) || r.clientId.startsWith('dcr_') || SYSTEM_CLIENT_IDS.has(r.clientId)) continue;
    plan.unmanaged.push(r.clientId);
  }
  return plan;
}

/** The plan as text, for --dry-run and the drift probe. Never holds a secret. */
export function describePlan(plan: Plan): string {
  const lines: string[] = [];
  for (const c of plan.create) lines.push(`+ create ${c.clientId} (${c.redirectUris.join(' ') || c.allowedGrants.join(' ')})`);
  for (const u of plan.update) {
    lines.push(`~ update ${u.clientId}`);
    for (const [f, d] of Object.entries(u.changes)) lines.push(`    ${f}: ${JSON.stringify(d!.from)} -> ${JSON.stringify(d!.to)}`);
  }
  for (const id of plan.unmanaged) lines.push(`? unmanaged ${id}: in the database, in no manifest`);
  return lines.length ? lines.join('\n') : 'no drift: the database matches clients/';
}
