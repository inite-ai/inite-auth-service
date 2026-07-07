import { hasPermission, SYSTEM_ROLE_PERMISSIONS } from '../permissions';

describe('hasPermission', () => {
  it('matches an exact permission', () => {
    expect(hasPermission(new Set(['org:read']), 'org:read')).toBe(true);
  });

  it('honours a trailing :* wildcard', () => {
    expect(hasPermission(new Set(['org:*']), 'org:members:manage')).toBe(true);
    expect(hasPermission(new Set(['org:*']), 'org:read')).toBe(true);
  });

  it('honours a bare * super-grant', () => {
    expect(hasPermission(new Set(['*']), 'anything:at:all')).toBe(true);
  });

  it('denies an unrelated permission', () => {
    expect(hasPermission(new Set(['org:read']), 'org:members:manage')).toBe(false);
    expect(hasPermission(new Set(['billing:*']), 'org:read')).toBe(false);
  });

  it('owner is a superset via org:*', () => {
    const owner = new Set(SYSTEM_ROLE_PERMISSIONS.owner);
    expect(hasPermission(owner, 'org:roles:manage')).toBe(true);
  });
});
