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
 * (a Nest API on its own host, a Python app with its own callback path) and
 * for redirect URIs still in use during a migration. Each names its reason.
 */

export const CALLBACK_PATH = '/callback';
export const BACKCHANNEL_LOGOUT_PATH = '/api/auth/backchannel-logout';
export const POST_LOGOUT_PATH = '/';
export const BASELINE_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const;
export const DEFAULT_GRANTS = ['authorization_code', 'refresh_token'] as const;

/** Clients the service seeds itself (system-clients.seeder.ts): never in a manifest. */
export const SYSTEM_CLIENT_IDS = new Set(['inite-cli']);

export interface ClientManifest {
  clientId: string;
  name: string;
  /** The GitHub repo whose secret holds this client's secret. Required to create or rotate. */
  repo?: string;
  /** The product's public origins. The first one is canonical. */
  origins: string[];
  /** Vertical scopes on top of the baseline (e.g. fund:read). */
  scopes?: string[];
  /** Resources this client may bind a token to besides its own id and origins. */
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
    /** Replaces <origin>/callback for every origin (e.g. "/api/auth/callback"). */
    callbackPath?: string;
    /** Redirect URIs kept in addition, while a product still uses them. */
    extraRedirectUris?: string[];
    /** A back-channel URI on another host (a separate API), or null for none. */
    backchannelLogoutUri?: string | null;
    grants?: string[];
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

/** The row a manifest means. */
export function deriveClient(m: ClientManifest): ClientRow {
  const o: Partial<NonNullable<ClientManifest['overrides']>> = m.overrides ?? {};
  const origins = m.origins.map(origin);
  const callback = o.callbackPath ?? CALLBACK_PATH;
  return {
    clientId: m.clientId,
    name: m.name,
    redirectUris: uniq([...origins.map((x) => x + callback), ...(o.extraRedirectUris ?? [])]),
    allowedScopes: uniq([...BASELINE_SCOPES, ...(m.scopes ?? []), ...(o.scopes ?? [])]),
    allowedGrants: uniq([...(o.grants ?? DEFAULT_GRANTS)]),
    allowedAudiences: uniq(m.audiences ?? []),
    backchannelLogoutUri: backchannelOf(m, origins),
    firstParty: true,
    isPublic: false,
    tokenEndpointAuthMethod: 'client_secret_post',
    companyId: m.companyId ?? null,
    active: m.active ?? true,
    customerLane: m.customerLane === true,
  };
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

function urlProblems(m: ClientManifest, familyDomains: readonly string[]): string[] {
  if (!Array.isArray(m.origins) || m.origins.length === 0) return ['origins: at least one'];
  const onFamily = (host: string) => familyDomains.some((d) => host === d || host.endsWith(`.${d}`));
  const bc = m.overrides?.backchannelLogoutUri;
  const urls = [...m.origins, ...(m.overrides?.extraRedirectUris ?? []), ...(bc ? [bc] : [])];
  const out = urls.map((u) => urlProblem(u, m, onFamily)).filter((p): p is string => p !== null);
  for (const o of m.origins) {
    if (URL.canParse(o) && new URL(o).pathname !== '/') out.push(`${o}: an origin has no path`);
  }
  return out;
}

function overrideProblems(m: ClientManifest): string[] {
  const out: string[] = [];
  for (const s of [...(m.scopes ?? []), ...(m.overrides?.scopes ?? [])]) if (!SCOPE.test(s)) out.push(`scope "${s}" is not a scope name`);
  if (m.overrides && (!m.overrides.reason || m.overrides.reason.trim().length < 8)) out.push('overrides need their reason beside them');
  if (m.overrides?.callbackPath && !m.overrides.callbackPath.startsWith('/')) out.push('overrides.callbackPath is a path');
  return out;
}

/** What is wrong with a manifest, as messages ([] when it is fine). */
export function manifestProblems(m: ClientManifest, file: string, familyDomains: readonly string[]): string[] {
  if (!m || typeof m !== 'object') return [`${file}: not an object`];
  return [...identityProblems(m, file), ...urlProblems(m, familyDomains), ...overrideProblems(m)].map((p) => `${file}: ${p}`);
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
  for (const c of plan.create) lines.push(`+ create ${c.clientId} (${c.redirectUris.join(' ')})`);
  for (const u of plan.update) {
    lines.push(`~ update ${u.clientId}`);
    for (const [f, d] of Object.entries(u.changes)) lines.push(`    ${f}: ${JSON.stringify(d!.from)} -> ${JSON.stringify(d!.to)}`);
  }
  for (const id of plan.unmanaged) lines.push(`? unmanaged ${id}: in the database, in no manifest`);
  return lines.length ? lines.join('\n') : 'no drift: the database matches clients/';
}
