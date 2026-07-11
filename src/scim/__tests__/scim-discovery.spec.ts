import { serviceProviderConfig, resourceTypes, schemas } from '../scim-discovery';
import { SCIM_SCHEMAS } from '../scim.contracts';

const BASE = 'https://auth.example.com';

describe('scim-discovery', () => {
  it('ServiceProviderConfig advertises patch + filter, not bulk/sort', () => {
    const cfg = serviceProviderConfig(BASE) as unknown as {
      patch: { supported: boolean };
      filter: { supported: boolean };
      bulk: { supported: boolean };
      sort: { supported: boolean };
      meta: { location: string };
    };
    expect(cfg.patch.supported).toBe(true);
    expect(cfg.filter.supported).toBe(true);
    expect(cfg.bulk.supported).toBe(false);
    expect(cfg.sort.supported).toBe(false);
    expect(cfg.meta.location).toBe(`${BASE}/scim/v2/ServiceProviderConfig`);
  });

  it('ResourceTypes lists User and Group', () => {
    const rt = resourceTypes(BASE) as { Resources: Array<{ id: string; endpoint: string; schema: string }> };
    const ids = rt.Resources.map((r) => r.id);
    expect(ids).toEqual(['User', 'Group']);
    expect(rt.Resources[0]!.schema).toBe(SCIM_SCHEMAS.user);
    expect(rt.Resources[1]!.endpoint).toBe('/Groups');
  });

  it('Schemas lists the User and Group core schemas', () => {
    const s = schemas() as { Resources: Array<{ id: string }> };
    expect(s.Resources.map((d) => d.id)).toEqual([SCIM_SCHEMAS.user, SCIM_SCHEMAS.group]);
  });
});
