import { loadManifests } from '../../clients/load';
import { BRAIN_SCOPES, dcrSupportedScopes, supportedScopes } from '../oauth-scopes.registry';

/**
 * brain:tenants lets a B2B product's machine client act for its client
 * companies' child tenants in Brain (`<companyId>__<child>`, brain #970,
 * ADR 0001). Brain derives the parent from the token's own tenant, so the
 * scope is only as wide as the client's companyId. It belongs on machine
 * clients only, never on a user's token or a self-registered client.
 */
const CHILD_TENANT_PRODUCTS = [
  'rent-brain',
  'training-brain',
  'services-brain',
  'shop-brain',
  'travel-brain',
  'health-brain',
  'food-brain',
  'studio-brain',
];

describe('brain:tenants', () => {
  it('is a brain scope the IdP advertises', () => {
    expect(BRAIN_SCOPES).toContain('brain:tenants');
    expect(supportedScopes()).toContain('brain:tenants');
  });

  it('is never open to dynamic registration', () => {
    expect(dcrSupportedScopes()).not.toContain('brain:tenants');
  });

  const manifests = loadManifests();

  it('is held only by machine clients', () => {
    const holders = manifests.filter((m) =>
      [...(m.scopes ?? []), ...(m.overrides?.scopes ?? [])].includes('brain:tenants'),
    );
    expect(holders.length).toBeGreaterThan(0);
    for (const m of holders) expect({ clientId: m.clientId, kind: m.kind }).toEqual({ clientId: m.clientId, kind: 'machine' });
  });

  it.each(CHILD_TENANT_PRODUCTS)('%s holds it, for audience brain, as a parent tenant', (clientId) => {
    const m = manifests.find((x) => x.clientId === clientId);
    expect(m).toBeDefined();
    expect(m!.kind).toBe('machine');
    expect(m!.scopes).toContain('brain:tenants');
    expect(m!.audiences).toContain('https://brain.inite.ai');
    // Brain reserves `__` for child ids and refuses a credential whose own
    // tenant contains it.
    expect(m!.companyId).toBeTruthy();
    expect(m!.companyId).not.toContain('__');
  });
});
