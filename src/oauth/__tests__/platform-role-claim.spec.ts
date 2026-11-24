import { platformRoleClaim } from '../platform-role-claim';

describe('platformRoleClaim', () => {
  it.each([[{ roles: ['user', 'admin'], isAdmin: true }], [{ isAdmin: true }], [{ isSuperadmin: true }]])(
    'says nothing for %j: an admin with no company is not the platform',
    (metadata) => {
      expect(platformRoleClaim({ metadata } as never)).toEqual({});
    },
  );

  it('names the platform superadmin from user metadata', () => {
    expect(platformRoleClaim({ metadata: { roles: ['superadmin'] } } as never)).toEqual({ platform_role: 'superadmin' });
  });

  it('gives nothing to a scoped admin or a plain user', () => {
    expect(platformRoleClaim({ metadata: { roles: ['admin'], companyId: 'c1' } } as never)).toEqual({});
    expect(platformRoleClaim({ metadata: { roles: ['user'] } } as never)).toEqual({});
    expect(platformRoleClaim({ metadata: null } as never)).toEqual({});
  });
});
