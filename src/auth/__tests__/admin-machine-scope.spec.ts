import { AdminGuard } from '../guards/admin.guard';
import { resolveAdminScope } from '../../admin/admin-scope';

/**
 * Coverage for the M2M admin path:
 *   - JwtStrategy emits `kind: 'machine'` for tokens without userId.
 *   - AdminGuard admits machine principals whose scope contains 'admin'.
 *   - resolveAdminScope maps machine principals to superadmin or scoped.
 *
 * We don't construct a real JwtStrategy here (it needs ConfigService +
 * AuthService) — we exercise the contract by feeding the same shape
 * JwtStrategy.validate() produces.
 */

function mockContext(user: any) {
  const req: any = { user, headers: {}, isAuthenticated: () => true };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

describe('AdminGuard — M2M admin scope', () => {
  let guard: AdminGuard;

  beforeEach(() => {
    guard = new AdminGuard({} as any);
    // Skip the JwtAuthGuard.canActivate() chain — it requires passport
    // wiring. The unit under test is the post-auth admin check.
    jest
      .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
      .mockResolvedValue(true);
  });

  it('admits machine principal with admin scope', async () => {
    const ctx = mockContext({
      kind: 'machine',
      sub: 'inite-auth-admin-tools',
      scope: new Set(['admin']),
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects machine principal without admin scope', async () => {
    const ctx = mockContext({
      kind: 'machine',
      sub: 'some-other-client',
      scope: new Set(['profile', 'email']),
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(/Admin scope required/);
  });

  it('still admits user principal with metadata.isAdmin', async () => {
    const ctx = mockContext({
      kind: 'user',
      userId: 'u1',
      metadata: { isAdmin: true },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('still admits user principal with roles=[admin]', async () => {
    const ctx = mockContext({
      kind: 'user',
      userId: 'u1',
      metadata: { roles: ['admin'] },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects user principal with no admin claim', async () => {
    const ctx = mockContext({
      kind: 'user',
      userId: 'u1',
      metadata: { roles: ['viewer'] },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(/Admin access required/);
  });
});

describe('resolveAdminScope — machine principals', () => {
  it('treats machine + admin scope + companyId as scoped', () => {
    const scope = resolveAdminScope({
      kind: 'machine',
      scope: new Set(['admin']),
      companyId: 'co_123',
    });
    expect(scope).toEqual({ kind: 'scoped', companyId: 'co_123' });
  });

  it('treats machine + admin scope without companyId as superadmin', () => {
    const scope = resolveAdminScope({
      kind: 'machine',
      scope: new Set(['admin']),
    });
    expect(scope).toEqual({ kind: 'superadmin' });
  });

  it('returns null for machine without admin scope', () => {
    const scope = resolveAdminScope({
      kind: 'machine',
      scope: new Set(['profile']),
    });
    expect(scope).toBeNull();
  });

  it('user superadmin still works', () => {
    const scope = resolveAdminScope({
      kind: 'user',
      metadata: { roles: ['superadmin'] },
    });
    expect(scope).toEqual({ kind: 'superadmin' });
  });
});
