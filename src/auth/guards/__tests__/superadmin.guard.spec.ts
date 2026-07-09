import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SuperadminGuard } from '../superadmin.guard';
import { AdminGuard } from '../admin.guard';
import type { AuthenticatedUser } from '../../authenticated-user';

/**
 * SuperadminGuard adds a superadmin-scope check on top of AdminGuard.
 * We stub the inherited AdminGuard.canActivate (auth + admin) to isolate
 * the added scope logic — the point under test is that a company-scoped
 * admin is rejected while an untenanted superadmin passes.
 */
describe('SuperadminGuard', () => {
  function contextFor(user: AuthenticatedUser | undefined): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  function guardAdmitting(): SuperadminGuard {
    jest.spyOn(AdminGuard.prototype, 'canActivate').mockResolvedValue(true);
    return new SuperadminGuard();
  }

  afterEach(() => jest.restoreAllMocks());

  it('admits a user whose roles include superadmin', async () => {
    const user = {
      kind: 'user',
      userId: 'u1',
      metadata: { roles: ['superadmin'] },
    } as unknown as AuthenticatedUser;
    await expect(guardAdmitting().canActivate(contextFor(user))).resolves.toBe(true);
  });

  it('rejects a company-scoped admin (not superadmin)', async () => {
    const user = {
      kind: 'user',
      userId: 'u2',
      metadata: { roles: ['admin'], companyId: 'acme' },
    } as unknown as AuthenticatedUser;
    await expect(guardAdmitting().canActivate(contextFor(user))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a machine token scoped to a single tenant', async () => {
    const user = {
      kind: 'machine',
      scope: new Set(['admin']),
      companyId: 'acme',
    } as unknown as AuthenticatedUser;
    await expect(guardAdmitting().canActivate(contextFor(user))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('admits an untenanted admin machine token (cross-tenant automation)', async () => {
    const user = {
      kind: 'machine',
      scope: new Set(['admin']),
    } as unknown as AuthenticatedUser;
    await expect(guardAdmitting().canActivate(contextFor(user))).resolves.toBe(true);
  });

  it('propagates a false authn result from AdminGuard without checking scope', async () => {
    jest.spyOn(AdminGuard.prototype, 'canActivate').mockResolvedValue(false);
    const guard = new SuperadminGuard();
    await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(false);
  });
});
