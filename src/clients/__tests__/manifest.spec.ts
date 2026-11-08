import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FAMILY_DOMAINS } from '../../oauth/resource-registry';
import { loadManifests } from '../load';
import {
  BACKCHANNEL_LOGOUT_PATH,
  CALLBACK_PATH,
  type ClientManifest,
  type ClientRow,
  backchannelUriFor,
  deriveClient,
  describePlan,
  manifestProblems,
  planApply,
  takesSecret,
} from '../manifest';

const rent: ClientManifest = { clientId: 'inite-rent', name: 'inite rent', repo: 'inite-ai/initerent', origins: ['https://inite.rent'], secret: { name: 'OAUTH_CLIENT_SECRET' } };

describe('the family conventions', () => {
  it('match @inite/auth (inite-shared packages/auth/src/kit/contract.ts)', () => {
    expect(CALLBACK_PATH).toBe('/callback');
    expect(BACKCHANNEL_LOGOUT_PATH).toBe('/api/auth/backchannel-logout');
  });

  it('derive every URL from the origin alone', () => {
    expect(deriveClient(rent)).toEqual({
      clientId: 'inite-rent',
      name: 'inite rent',
      redirectUris: ['https://inite.rent/callback'],
      allowedScopes: ['openid', 'profile', 'email', 'offline_access'],
      allowedGrants: ['authorization_code', 'refresh_token'],
      allowedAudiences: [],
      backchannelLogoutUri: 'https://inite.rent/api/auth/backchannel-logout',
      firstParty: true,
      isPublic: false,
      tokenEndpointAuthMethod: 'client_secret_post',
      companyId: null,
      active: true,
      customerLane: false,
      customerLanePrefix: null,
    });
  });

  it('sign in customers only when the manifest says so', () => {
    expect(deriveClient({ ...rent, customerLane: true }).customerLane).toBe(true);
    expect(deriveClient(rent).customerLane).toBe(false);
  });

  it('take the back-channel on the first origin, and a redirect for each', () => {
    const d = deriveClient({ ...rent, origins: ['https://www.inite.health', 'https://inite.health'] });
    expect(d.redirectUris).toEqual(['https://www.inite.health/callback', 'https://inite.health/callback']);
    expect(d.backchannelLogoutUri).toBe('https://www.inite.health/api/auth/backchannel-logout');
  });

  it('keep an override only where a backend differs, with its reason', () => {
    const fund = deriveClient({ ...rent, clientId: 'inite-fund', origins: ['https://app.inite.fund'], overrides: { reason: 'Litestar callback path', callbackPath: '/auth/callback' } });
    expect(fund.redirectUris).toEqual(['https://app.inite.fund/auth/callback']);
    expect(fund.backchannelLogoutUri).toBe('https://app.inite.fund/api/auth/backchannel-logout');
    const api = deriveClient({ ...rent, overrides: { reason: 'Nest API on its own host', backchannelLogoutUri: 'https://api.inite.rent/api/auth/backchannel-logout' } });
    expect(api.backchannelLogoutUri).toBe('https://api.inite.rent/api/auth/backchannel-logout');
    expect(manifestProblems({ ...rent, overrides: { reason: '', callbackPath: '/x' } }, 'inite-rent.json', FAMILY_DOMAINS)).toEqual([
      'inite-rent.json: overrides need their reason beside them',
    ]);
  });
});

describe('a manifest is refused when', () => {
  const problems = (m: Partial<ClientManifest>, file = 'inite-rent.json') => manifestProblems({ ...rent, ...m } as ClientManifest, file, FAMILY_DOMAINS);
  it('it carries a loopback or http URI, or a host outside the family', () => {
    expect(problems({ origins: ['http://localhost:3000'] }).join()).toMatch(/https only/);
    expect(problems({ origins: ['https://evil.example'] }).join()).toMatch(/not on a family domain/);
    expect(problems({ origins: ['https://evil.example'], outsideFamily: 'the owner’s own site' })).toEqual([]);
  });
  it('it is a self-registered or system client, or misnamed', () => {
    expect(problems({ clientId: 'dcr_abc' }, 'dcr_abc.json').join()).toMatch(/self-registered/);
    expect(problems({ clientId: 'inite-cli' }, 'inite-cli.json').join()).toMatch(/system client/);
    expect(problems({}, 'other.json').join()).toMatch(/named inite-rent.json/);
  });
  it('an origin has a path, or a secret has no repo', () => {
    expect(problems({ origins: ['https://inite.rent/app'] }).join()).toMatch(/no path/);
    expect(problems({ repo: undefined }).join()).toMatch(/secret needs the repo/);
  });
});

describe('planApply', () => {
  const row = (over: Partial<ClientRow> = {}): ClientRow => ({ ...deriveClient(rent), ...over });

  it('is empty when the database matches, whatever the array order', () => {
    const scopes = [...deriveClient(rent).allowedScopes].reverse();
    expect(planApply([deriveClient(rent)], [row({ allowedScopes: scopes })])).toEqual({ create: [], update: [], unmanaged: [] });
  });

  it('fills the back-channel URI an existing client never had', () => {
    const plan = planApply([deriveClient(rent)], [row({ backchannelLogoutUri: null })]);
    expect(plan.update).toEqual([{ clientId: 'inite-rent', changes: { backchannelLogoutUri: { from: null, to: 'https://inite.rent/api/auth/backchannel-logout' } } }]);
    expect(describePlan(plan)).toContain('~ update inite-rent');
  });

  it('creates what is missing, and reports, never deletes, what no manifest names', () => {
    const plan = planApply([deriveClient(rent)], [row({ clientId: 'legacy' }), row({ clientId: 'dcr_x' }), row({ clientId: 'inite-cli' })]);
    expect(plan.create.map((c) => c.clientId)).toEqual(['inite-rent']);
    expect(plan.unmanaged).toEqual(['legacy']);
  });
});

describe('backchannelUriFor (the fan-out)', () => {
  const c = { clientId: 'inite-estate', firstParty: true, isPublic: false, redirectUris: ['https://inite.estate/callback'], backchannelLogoutUri: null };
  it('derives the convention for a first-party client that registered none', () => {
    expect(backchannelUriFor(c)).toBe('https://inite.estate/api/auth/backchannel-logout');
  });
  it('keeps an explicit one, and gives none to dcr_, public or third-party clients', () => {
    expect(backchannelUriFor({ ...c, backchannelLogoutUri: 'https://api.x.inite.ai/bc' })).toBe('https://api.x.inite.ai/bc');
    expect(backchannelUriFor({ ...c, clientId: 'dcr_1' })).toBeNull();
    expect(backchannelUriFor({ ...c, isPublic: true })).toBeNull();
    expect(backchannelUriFor({ ...c, firstParty: false })).toBeNull();
    expect(backchannelUriFor({ ...c, redirectUris: ['http://127.0.0.1/callback'] })).toBeNull();
  });
});

describe('clients/ in this repo', () => {
  it('every manifest is valid, and named after its client', () => {
    const files = readdirSync(join(__dirname, '..', '..', '..', 'clients')).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(20);
    expect(() => loadManifests()).not.toThrow();
  });
  it('no prod client carries a loopback redirect, and every confidential sign-in client gets the back-channel by convention', () => {
    for (const m of loadManifests()) {
      const d = deriveClient(m);
      expect(d.redirectUris.every((u) => u.startsWith('https://'))).toBe(true);
      if (m.kind === 'machine' || d.isPublic) expect(d.backchannelLogoutUri).toBeNull();
      else expect(d.backchannelLogoutUri).toMatch(/^https:\/\/[^/]+\/api\/auth\/backchannel-logout$/);
    }
  });
});

// The rows in prod on 04.11.2026 (oauth_clients, managed fields). Each
// manifest must reproduce its row exactly, so the first apply changes nothing.
const BILLING_AUDIENCE = 'https://billing.inite.ai/v1/services';
type ProdId = 'break3-backend' | 'inite-education-billing' | 'floripa';
const PROD: Record<ProdId, ClientRow> = {
  'break3-backend': {
    clientId: 'break3-backend',
    name: 'Break3 backend (billing service client)',
    redirectUris: [],
    allowedScopes: ['billing:checkout', 'billing:commitments'],
    allowedGrants: ['client_credentials'],
    allowedAudiences: [BILLING_AUDIENCE],
    backchannelLogoutUri: null,
    firstParty: true,
    isPublic: false,
    tokenEndpointAuthMethod: 'client_secret_post',
    companyId: null,
    active: true,
    customerLane: false,
    // Issue #304's column: null on every row that existed before it.
    customerLanePrefix: null,
  },
  'inite-education-billing': {
    clientId: 'inite-education-billing',
    name: 'inite education (billing service client)',
    redirectUris: [],
    allowedScopes: ['billing:checkout'],
    allowedGrants: ['client_credentials'],
    allowedAudiences: [BILLING_AUDIENCE],
    backchannelLogoutUri: null,
    firstParty: true,
    isPublic: false,
    tokenEndpointAuthMethod: 'client_secret_post',
    companyId: null,
    active: true,
    customerLane: false,
    // Issue #304's column: null on every row that existed before it.
    customerLanePrefix: null,
  },
  floripa: {
    clientId: 'floripa',
    name: 'Флорипа по-русски (floripa.info)',
    redirectUris: ['https://floripa.info/api/auth/inite/callback'],
    allowedScopes: ['openid', 'profile', 'email'],
    allowedGrants: ['authorization_code'],
    allowedAudiences: [],
    backchannelLogoutUri: null,
    firstParty: true,
    isPublic: true,
    tokenEndpointAuthMethod: 'none',
    companyId: null,
    active: true,
    customerLane: false,
    // Issue #304's column: null on every row that existed before it.
    customerLanePrefix: null,
  },
};

/**
 * Changes made on purpose since the snapshot above, one per line: the manifest
 * may differ from the pre-manifest prod row by exactly these fields.
 */
const SINCE_PROD: Partial<Record<ProdId, Partial<ClientRow>>> = {
  // Issue #299: floripa asks for the first-party `telegram` scope (telegram_id claim).
  floripa: { allowedScopes: ['openid', 'profile', 'email', 'telegram'] },
};
const expectedRow = (id: ProdId): ClientRow => ({ ...PROD[id], ...SINCE_PROD[id] });

describe('the clients that were in prod before any manifest', () => {
  const byId = new Map(loadManifests().map((m) => [m.clientId, m]));

  it.each(Object.keys(PROD) as ProdId[])('%s derives exactly its prod row, field by field', (id) => {
    const m = byId.get(id);
    expect(m).toBeDefined();
    const d = deriveClient(m!);
    const want = expectedRow(id);
    for (const f of Object.keys(want) as (keyof ClientRow)[]) expect([f, d[f]]).toEqual([f, want[f]]);
    expect(d).toEqual(want);
  });

  it('so applying them changes only what changed on purpose, and they leave "unmanaged"', () => {
    const rows = Object.values(PROD);
    const leftover = { ...PROD.floripa, clientId: 'test-flow-1779413916', active: false };
    const plan = planApply([...byId.keys()].filter((id) => id in PROD).map((id) => deriveClient(byId.get(id)!)), [...rows, leftover]);
    expect(plan.create).toEqual([]);
    expect(plan.unmanaged).toEqual(['test-flow-1779413916']);
    expect(plan.update.map((u) => [u.clientId, Object.keys(u.changes)])).toEqual(
      Object.entries(SINCE_PROD).map(([id, row]) => [id, Object.keys(row ?? {})]),
    );
  });

  it('the machine clients take a secret, the public one never does', () => {
    expect(takesSecret(PROD['break3-backend'])).toBe(true);
    expect(takesSecret(PROD['inite-education-billing'])).toBe(true);
    expect(takesSecret(PROD.floripa)).toBe(false);
    expect(byId.get('floripa')!.secret).toBeUndefined();
  });
});

describe('a machine manifest', () => {
  const machine: ClientManifest = {
    clientId: 'svc-x',
    name: 'svc x',
    kind: 'machine',
    repo: 'inite-ai/svc-x',
    scopes: ['billing:checkout'],
    audiences: [BILLING_AUDIENCE],
    secret: { name: 'BILLING_AUTH_CLIENT_SECRET' },
  };
  const problems = (m: Partial<ClientManifest>) => manifestProblems({ ...machine, ...m } as ClientManifest, 'svc-x.json', FAMILY_DOMAINS);

  it('is valid as it stands, with no origins', () => {
    expect(problems({})).toEqual([]);
  });
  it('gets client_credentials only, its scopes without the OIDC baseline, no redirect and no back-channel', () => {
    const d = deriveClient(machine);
    expect(d.allowedGrants).toEqual(['client_credentials']);
    expect(d.allowedScopes).toEqual(['billing:checkout']);
    expect(d.redirectUris).toEqual([]);
    expect(d.backchannelLogoutUri).toBeNull();
    expect(d.isPublic).toBe(false);
    expect(d.tokenEndpointAuthMethod).toBe('client_secret_post');
  });
  it('is refused with origins, overrides, outsideFamily or customerLane', () => {
    expect(problems({ origins: ['https://billing.inite.ai'] }).join()).toMatch(/machine client has no origins/);
    expect(problems({ overrides: { reason: 'some reason here', grants: ['client_credentials'] } }).join()).toMatch(/machine client has no overrides/);
    expect(problems({ outsideFamily: 'because reasons' }).join()).toMatch(/machine client has no outsideFamily/);
    expect(problems({ customerLane: true }).join()).toMatch(/machine client has no customerLane/);
  });
  it('is refused without scopes or audiences, with OIDC scopes, or with an audience outside the family', () => {
    expect(problems({ scopes: [] }).join()).toMatch(/lists its scopes/);
    expect(problems({ scopes: ['openid', 'billing:checkout'] }).join()).toMatch(/no OIDC scopes/);
    expect(problems({ audiences: undefined }).join()).toMatch(/lists the audiences/);
    expect(problems({ audiences: ['https://evil.example/v1'] }).join()).toMatch(/not on a family domain/);
    expect(problems({ audiences: ['http://billing.inite.ai/v1'] }).join()).toMatch(/https only/);
  });
  it('is refused with an unknown kind', () => {
    expect(problems({ kind: 'robot' as 'machine' }).join()).toMatch(/kind is "machine" or absent/);
  });
});

describe('a public override', () => {
  const pub: ClientManifest = {
    clientId: 'pub-x',
    name: 'pub x',
    origins: ['https://pub.inite.ai'],
    overrides: { reason: 'a PKCE-only portal', public: true, grants: ['authorization_code'], scopes: ['openid', 'profile', 'email'], backchannelLogoutUri: null },
  };
  const problems = (o: Partial<NonNullable<ClientManifest['overrides']>>, m: Partial<ClientManifest> = {}) =>
    manifestProblems({ ...pub, ...m, overrides: { ...pub.overrides!, ...o } } as ClientManifest, 'pub-x.json', FAMILY_DOMAINS);

  it('is valid, and gives isPublic with auth method none and exactly the listed scopes', () => {
    expect(problems({})).toEqual([]);
    const d = deriveClient(pub);
    expect([d.isPublic, d.tokenEndpointAuthMethod, d.backchannelLogoutUri]).toEqual([true, 'none', null]);
    expect(d.allowedScopes).toEqual(['openid', 'profile', 'email']);
  });
  it('is refused with a secret, a confidential-only grant, or a back-channel left to the convention', () => {
    expect(problems({}, { repo: 'inite-ai/pub', secret: { name: 'OAUTH_CLIENT_SECRET' } }).join()).toMatch(/no secret to deliver/);
    expect(problems({ grants: ['authorization_code', 'client_credentials'] }).join()).toMatch(/cannot hold client_credentials/);
    const { backchannelLogoutUri: _drop, ...rest } = pub.overrides!;
    void _drop;
    expect(manifestProblems({ ...pub, overrides: rest }, 'pub-x.json', FAMILY_DOMAINS).join()).toMatch(/no back-channel/);
    expect(problems({ backchannelLogoutUri: 'https://pub.inite.ai/bc' }).join()).toMatch(/no back-channel/);
  });
  it('is refused when public is not true', () => {
    expect(problems({ public: false as unknown as true }).join()).toMatch(/overrides.public is true or absent/);
  });
});

describe('the scope and key rules', () => {
  const problems = (m: Partial<ClientManifest>) => manifestProblems({ ...rent, ...m } as ClientManifest, 'inite-rent.json', FAMILY_DOMAINS);
  it('overrides.scopes replaces the baseline, keeps openid, and is not mixed with scopes', () => {
    expect(deriveClient({ ...rent, overrides: { reason: 'exact scope list', scopes: ['openid', 'email', 'offline_access'] } }).allowedScopes).toEqual(['openid', 'email', 'offline_access']);
    expect(problems({ overrides: { reason: 'exact scope list', scopes: ['email'] } }).join()).toMatch(/keeps openid/);
    expect(problems({ scopes: ['fund:read'], overrides: { reason: 'exact scope list', scopes: ['openid'] } }).join()).toMatch(/not together/);
  });
  it('offline_access needs the refresh_token grant', () => {
    expect(problems({ overrides: { reason: 'no refresh here', grants: ['authorization_code'] } }).join()).toMatch(/offline_access needs the refresh_token grant/);
  });
  it('an unknown key is refused, at the top, in overrides and in secret', () => {
    expect(problems({ kindd: 'machine' } as Partial<ClientManifest>).join()).toMatch(/unknown key "kindd"/);
    expect(problems({ overrides: { reason: 'a typo in here', publik: true } as unknown as ClientManifest['overrides'] }).join()).toMatch(/unknown key "overrides.publik"/);
    expect(problems({ secret: { name: 'OAUTH_CLIENT_SECRET', env: 'prod' } as unknown as ClientManifest['secret'] }).join()).toMatch(/unknown key "secret.env"/);
  });
});

describe('storefront orgs: customerLanePrefix (issue #304)', () => {
  const problems = (m: Partial<ClientManifest>) => manifestProblems({ ...rent, ...m } as ClientManifest, 'inite-rent.json', FAMILY_DOMAINS);

  it('a lane client with a prefix also calls auth as itself, for its orgs only', () => {
    const row = deriveClient({ ...rent, customerLane: true, customerLanePrefix: 'rent-' });
    expect(row.customerLanePrefix).toBe('rent-');
    expect(row.allowedGrants).toEqual(['authorization_code', 'refresh_token', 'client_credentials']);
    expect(row.allowedScopes).toContain('customer-lane:orgs');
  });

  it('without the prefix, or without the lane, the row is as before', () => {
    for (const m of [{ ...rent, customerLane: true }, { ...rent }]) {
      const row = deriveClient(m);
      expect(row.customerLanePrefix).toBeNull();
      expect(row.allowedGrants).not.toContain('client_credentials');
      expect(row.allowedScopes).not.toContain('customer-lane:orgs');
    }
  });

  it('the prefix needs the lane and a form like "shop-"; the scope is never listed by hand', () => {
    expect(problems({ customerLanePrefix: 'rent-' }).join()).toMatch(/only for a customerLane client/);
    for (const bad of ['rent', 'Rent-', '-', 'r-', 'rent_-', 'a'.repeat(17) + '-']) {
      expect(problems({ customerLane: true, customerLanePrefix: bad }).join()).toMatch(/customerLanePrefix is lower-case/);
    }
    expect(problems({ customerLane: true, customerLanePrefix: 'rent-' })).toEqual([]);
    expect(problems({ scopes: ['customer-lane:orgs'] }).join()).toMatch(/comes from customerLanePrefix/);
  });

  it('a machine client has no prefix', () => {
    const machine = { clientId: 'svc-x', name: 'svc', kind: 'machine', scopes: ['a:b'], audiences: ['https://inite.ai'] } as ClientManifest;
    expect(manifestProblems({ ...machine, customerLanePrefix: 'svc-' }, 'svc-x.json', FAMILY_DOMAINS).join()).toMatch(/no customerLanePrefix/);
  });

  it('the three storefronts keep their orgs under their own prefixes', () => {
    const byId = new Map(loadManifests().map((m) => [m.clientId, deriveClient(m)]));
    expect([...byId.values()].filter((r) => r.customerLanePrefix).map((r) => [r.clientId, r.customerLanePrefix]).sort()).toEqual([
      ['inite-food', 'food-'],
      ['inite-shop', 'shop-'],
      ['inite-training', 'club-'],
    ]);
  });
});
