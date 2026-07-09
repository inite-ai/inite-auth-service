import { RbacService } from '../rbac.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('RbacService', () => {
  let prisma: {
    membership: { findUnique: jest.Mock; findMany: jest.Mock };
    orgRole: { findFirst: jest.Mock };
  };
  let service: RbacService;

  beforeEach(() => {
    prisma = {
      membership: { findUnique: jest.fn(), findMany: jest.fn() },
      orgRole: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    service = new RbacService(prisma as unknown as PrismaService);
  });

  it('resolves system-role permissions from the static catalog', async () => {
    prisma.membership.findUnique.mockResolvedValue({ role: 'admin', status: 'active' });
    const perms = await service.resolvePermissions('u1', 'org1');
    expect(perms.has('org:members:manage')).toBe(true);
    expect(perms.has('org:roles:manage')).toBe(true);
  });

  it('prefers a custom OrgRole over the system catalog', async () => {
    prisma.membership.findUnique.mockResolvedValue({ role: 'analyst', status: 'active' });
    prisma.orgRole.findFirst.mockResolvedValue({ permissions: ['reports:read'] });
    const perms = await service.resolvePermissions('u1', 'org1');
    expect([...perms]).toEqual(['reports:read']);
  });

  it('returns no permissions for a non-member', async () => {
    prisma.membership.findUnique.mockResolvedValue(null);
    const perms = await service.resolvePermissions('u1', 'org1');
    expect(perms.size).toBe(0);
  });

  it('returns no permissions for a suspended membership', async () => {
    prisma.membership.findUnique.mockResolvedValue({ role: 'admin', status: 'suspended' });
    const perms = await service.resolvePermissions('u1', 'org1');
    expect(perms.size).toBe(0);
  });
});
