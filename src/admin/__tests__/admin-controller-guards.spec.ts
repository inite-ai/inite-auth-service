import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminController } from '../admin.controller';
import { SuperadminGuard } from '../../auth/guards/superadmin.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';

/**
 * Users and OAuth clients are platform-wide rows. A company-scoped admin
 * passing AdminGuard used to reach them all: PUT users/:id/roles with
 * ["superadmin"] on itself, or a new untenanted client with the `admin`
 * scope. Every such route must carry SuperadminGuard; only the
 * tenant-scoped audit log may stay on AdminGuard alone.
 */
describe('AdminController guard wiring', () => {
  const proto = AdminController.prototype as unknown as Record<string, unknown>;
  const guardsOf = (method: string): unknown[] =>
    (Reflect.getMetadata(GUARDS_METADATA, proto[method] as object) as unknown[]) ?? [];

  const superadminOnly = [
    'getStats',
    'getAllUsers',
    'getUserById',
    'updateUser',
    'updateUserRoles',
    'deleteUser',
    'revokeUserSessions',
    'getAllOAuthClients',
    'getOAuthClientById',
    'createOAuthClient',
    'updateOAuthClient',
    'rotateClientSecret',
    'deleteOAuthClient',
  ];

  it.each(superadminOnly)('%s requires SuperadminGuard', (method) => {
    expect(typeof proto[method]).toBe('function');
    expect(guardsOf(method)).toContain(SuperadminGuard);
  });

  it('every route handler is either superadmin-only or the scoped audit log', () => {
    const handlers = Object.getOwnPropertyNames(AdminController.prototype).filter(
      (n) => n !== 'constructor' && !n.startsWith('build') &&
        Reflect.getMetadata('path', proto[n] as object) !== undefined,
    );
    const scoped = handlers.filter((n) => !superadminOnly.includes(n)).sort();
    expect(scoped).toEqual(['exportAuditLog', 'getAuditLog']);
  });

  it('the class still requires AdminGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminController)).toContain(AdminGuard);
  });
});
