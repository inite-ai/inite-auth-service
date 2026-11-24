import { adminTier, resolveAdminScope, applyScopeFilter } from '../admin-scope';

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

    // Superadmin is a role somebody gave, never the absence of a company.
    it.each([
      [{ isAdmin: true }],
      [{ roles: ['user', 'admin'], isAdmin: true }],
      [{ roles: ['admin'], companyId: '' }],
      [{ roles: ['admin'], companyId: null }],
      [{ isSuperadmin: true, roles: [] }],
      [{ isSuperadmin: true, isAdmin: true }],
      [{ roles: 'superadmin' }],
    ])('gives %j no scope at all', (metadata) => {
      expect(resolveAdminScope({ metadata })).toBeNull();
    });

    it('an isSuperadmin flag does not widen a company admin', () => {
      expect(
        resolveAdminScope({ metadata: { isSuperadmin: true, roles: ['admin'], companyId: 'acme' } }),
      ).toEqual({ kind: 'scoped', companyId: 'acme' });
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
  });

  describe('adminTier', () => {
    it.each([
      [{ roles: ['superadmin'] }, 'superadmin'],
      [{ roles: ['superadmin'], companyId: 'acme' }, 'superadmin'],
      [{ roles: ['admin'] }, 'unscoped'],
      [{ isAdmin: true, companyId: '' }, 'unscoped'],
      [{ isSuperadmin: true }, 'unscoped'],
      [{ roles: ['admin'], companyId: 'acme' }, 'company'],
      [{ roles: ['user'] }, null],
      [null, null],
    ])('%j -> %s', (metadata, tier) => {
      expect(adminTier(metadata as Record<string, unknown> | null)).toBe(tier);
    });
  });

  describe('applyScopeFilter', () => {
    it('does not touch the where-clause for superadmin', () => {
      const where: Record<string, unknown> = { event: 'token.issued.client_credentials' };
      applyScopeFilter({ kind: 'superadmin' }, where);
      expect(where).toEqual({ event: 'token.issued.client_credentials' });
    });

    it('overrides any pre-set companyId for scoped admin', () => {
      // URL tampering test — a scoped admin must not be able to widen
      // visibility by passing a different companyId in the query.
      const where: Record<string, unknown> = { companyId: 'co_other', event: 'X' };
      applyScopeFilter({ kind: 'scoped', companyId: 'co_mine' }, where);
      expect(where.companyId).toBe('co_mine');
      expect(where.event).toBe('X');
    });

    it('adds companyId when not present', () => {
      const where: Record<string, unknown> = {};
      applyScopeFilter({ kind: 'scoped', companyId: 'co_x' }, where);
      expect(where).toEqual({ companyId: 'co_x' });
    });
  });
});
