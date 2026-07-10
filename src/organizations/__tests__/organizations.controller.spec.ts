import { ForbiddenException } from '@nestjs/common';
import { OrganizationsController } from '../organizations.controller';
import { OrganizationsService } from '../organizations.service';
import type { AuthenticatedUser } from '../../auth/authenticated-user';

/**
 * Controller-level checks: the shared scope() helper resolves the operator's
 * tenant scope (rejecting a non-admin principal) and each route delegates to
 * OrganizationsService with that scope. Service logic is tested separately.
 */
describe('OrganizationsController', () => {
  const superadmin = {
    kind: 'user',
    userId: 'u1',
    metadata: { roles: ['superadmin'] },
  } as unknown as AuthenticatedUser;

  const nonAdmin = {
    kind: 'user',
    userId: 'u2',
    metadata: { roles: [] },
  } as unknown as AuthenticatedUser;

  let service: jest.Mocked<OrganizationsService>;
  let controller: OrganizationsController;

  beforeEach(() => {
    service = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'o1' }),
      get: jest.fn().mockResolvedValue({ id: 'o1' }),
      remove: jest.fn().mockResolvedValue(undefined),
      listMembers: jest.fn().mockResolvedValue([]),
      upsertMember: jest.fn().mockResolvedValue({ id: 'm1' }),
      removeMember: jest.fn().mockResolvedValue(undefined),
      listRoles: jest.fn().mockResolvedValue([]),
      createRole: jest.fn().mockResolvedValue({ id: 'r1' }),
      updateRole: jest.fn().mockResolvedValue({ id: 'r1' }),
    } as unknown as jest.Mocked<OrganizationsService>;
    controller = new OrganizationsController(service);
  });

  it('rejects a non-admin principal with Forbidden', () => {
    expect(() => controller.list(nonAdmin)).toThrow(ForbiddenException);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('list delegates with the resolved superadmin scope', async () => {
    await controller.list(superadmin);
    expect(service.list).toHaveBeenCalledWith({ kind: 'superadmin' });
  });

  it('create passes scope + dto', async () => {
    const dto = { name: 'Acme', slug: 'acme' } as never;
    await controller.create(superadmin, dto);
    expect(service.create).toHaveBeenCalledWith({ kind: 'superadmin' }, dto);
  });

  it('remove awaits the service and returns success', async () => {
    await expect(controller.remove(superadmin, 'o1')).resolves.toEqual({ success: true });
    expect(service.remove).toHaveBeenCalledWith({ kind: 'superadmin' }, 'o1');
  });

  it('upsertMember passes scope, orgId, dto', async () => {
    const dto = { userId: 'u9', role: 'member' } as never;
    await controller.upsertMember(superadmin, 'o1', dto);
    expect(service.upsertMember).toHaveBeenCalledWith({ kind: 'superadmin' }, 'o1', dto);
  });

  it('removeMember awaits + returns success', async () => {
    await expect(controller.removeMember(superadmin, 'o1', 'u9')).resolves.toEqual({ success: true });
    expect(service.removeMember).toHaveBeenCalledWith({ kind: 'superadmin' }, 'o1', 'u9');
  });

  it('createRole passes scope, orgId, dto', async () => {
    const dto = { slug: 'auditor', name: 'Auditor', permissions: ['org:read'] } as never;
    await controller.createRole(superadmin, 'o1', dto);
    expect(service.createRole).toHaveBeenCalledWith({ kind: 'superadmin' }, 'o1', dto);
  });

  it('updateRole folds slug into the patch and passes scope + orgId', async () => {
    const dto = { name: 'Auditor', permissions: ['org:read'] } as never;
    await controller.updateRole(superadmin, 'o1', 'auditor', dto);
    expect(service.updateRole).toHaveBeenCalledWith({ kind: 'superadmin' }, 'o1', {
      slug: 'auditor',
      name: 'Auditor',
      permissions: ['org:read'],
    });
  });
});
