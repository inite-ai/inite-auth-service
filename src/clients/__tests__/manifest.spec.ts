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
    });
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
  it('no prod client carries a loopback redirect, and every one gets the back-channel by convention', () => {
    for (const m of loadManifests()) {
      const d = deriveClient(m);
      expect(d.redirectUris.every((u) => u.startsWith('https://'))).toBe(true);
      expect(d.backchannelLogoutUri).toMatch(/^https:\/\/[^/]+\/api\/auth\/backchannel-logout$/);
    }
  });
});
