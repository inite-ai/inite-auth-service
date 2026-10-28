import { platformRoleClaim } from '../oauth-token-issuer.service';

describe('platformRoleClaim', () => {
  it('names the platform superadmin from user metadata', () => {
    expect(platformRoleClaim({ metadata: { roles: ['superadmin'] } } as never)).toEqual({ platform_role: 'superadmin' });
    expect(platformRoleClaim({ metadata: { isSuperadmin: true } } as never)).toEqual({ platform_role: 'superadmin' });
  });

  it('gives nothing to a scoped admin or a plain user', () => {
    expect(platformRoleClaim({ metadata: { roles: ['admin'], companyId: 'c1' } } as never)).toEqual({});
    expect(platformRoleClaim({ metadata: { roles: ['user'] } } as never)).toEqual({});
    expect(platformRoleClaim({ metadata: null } as never)).toEqual({});
  });
});
