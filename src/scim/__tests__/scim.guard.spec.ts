import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ScimGuard } from '../scim.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { fakeSettings } from '../../common/settings/settings.test-fixture';

function ctxFor(method: string, user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(enabled: boolean): ScimGuard {
  return new ScimGuard(fakeSettings({ SCIM_ENABLED: enabled ? 'true' : 'false' }));
}

describe('ScimGuard', () => {
  beforeEach(() => {
    // Pass the underlying passport-jwt authentication so we test our gates only.
    jest.spyOn(JwtAuthGuard.prototype, 'canActivate').mockResolvedValue(true);
  });
  afterEach(() => jest.restoreAllMocks());

  it('404s when SCIM is disabled', async () => {
    const guard = guardWith(false);
    await expect(
      guard.canActivate(ctxFor('GET', { kind: 'machine', scope: new Set(['scim:read']) })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a non-machine (user) principal', async () => {
    const guard = guardWith(true);
    await expect(
      guard.canActivate(ctxFor('GET', { kind: 'user', scope: new Set(['scim:read']) })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a read with scim:read', async () => {
    const guard = guardWith(true);
    await expect(
      guard.canActivate(ctxFor('GET', { kind: 'machine', scope: new Set(['scim:read']) })),
    ).resolves.toBe(true);
  });

  it('rejects a write when only scim:read is present', async () => {
    const guard = guardWith(true);
    await expect(
      guard.canActivate(ctxFor('POST', { kind: 'machine', scope: new Set(['scim:read']) })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a write with scim:write', async () => {
    const guard = guardWith(true);
    await expect(
      guard.canActivate(ctxFor('DELETE', { kind: 'machine', scope: new Set(['scim:write']) })),
    ).resolves.toBe(true);
  });

  it('accepts an admin-scoped token for both reads and writes', async () => {
    const guard = guardWith(true);
    await expect(
      guard.canActivate(ctxFor('POST', { kind: 'machine', scope: new Set(['admin']) })),
    ).resolves.toBe(true);
  });
});
