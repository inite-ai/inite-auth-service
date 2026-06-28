import { resolveAdminScope, applyScopeFilter } from '../admin-scope';

describe('admin-scope', () => {
  describe('resolveAdminScope', () => {
    it('returns null for a non-admin user', () => {
      expect(resolveAdminScope({ metadata: { roles: ['user'] } })).toBeNull();
      expect(resolveAdminScope({ metadata: {} })).toBeNull();
      expect(resolveAdminScope(undefined)).toBeNull();
    });

    it('returns superadmin for explicit superadmin role', () => {
      const scope = resolveAdminScope({ metadata: { roles: ['superadmin'] } });
      expect(scope).toEqual({ kind: 'superadmin' });
    });

    it('returns superadmin for explicit isSuperadmin flag', () => {
      const scope = resolveAdminScope({
        metadata: { isSuperadmin: true, roles: [] },
      });
      expect(scope).toEqual({ kind: 'superadmin' });
    });

    it('returns scoped admin for admin with companyId', () => {
      const scope = resolveAdminScope({
        metadata: { isAdmin: true, companyId: 'co_acme' },
      });
      expect(scope).toEqual({ kind: 'scoped', companyId: 'co_acme' });
    });

    it('returns scoped admin when admin role + companyId via roles array', () => {
      const scope = resolveAdminScope({
        metadata: { roles: ['admin'], companyId: 'co_beta' },
      });
      expect(scope).toEqual({ kind: 'scoped', companyId: 'co_beta' });
    });

    it('treats legacy admins without companyId as superadmin (back-compat)', () => {
      const scope = resolveAdminScope({ metadata: { isAdmin: true } });
      expect(scope).toEqual({ kind: 'superadmin' });
    });

    it('ignores empty-string companyId on a scoped admin', () => {
      const scope = resolveAdminScope({
        metadata: { isAdmin: true, companyId: '' },
      });
      expect(scope).toEqual({ kind: 'superadmin' });
    });
  });

  describe('applyScopeFilter', () => {
    it('does not touch the where-clause for superadmin', () => {
      const where: any = { event: 'token.issued.client_credentials' };
      applyScopeFilter({ kind: 'superadmin' }, where);
      expect(where).toEqual({ event: 'token.issued.client_credentials' });
    });

    it('overrides any pre-set companyId for scoped admin', () => {
      // URL tampering test — a scoped admin must not be able to widen
      // visibility by passing a different companyId in the query.
      const where: any = { companyId: 'co_other', event: 'X' };
      applyScopeFilter({ kind: 'scoped', companyId: 'co_mine' }, where);
      expect(where.companyId).toBe('co_mine');
      expect(where.event).toBe('X');
    });

    it('adds companyId when not present', () => {
      const where: any = {};
      applyScopeFilter({ kind: 'scoped', companyId: 'co_x' }, where);
      expect(where).toEqual({ companyId: 'co_x' });
    });
  });
});
