import { ConflictException, NotFoundException } from '@nestjs/common';
import { ScimGroupsService } from '../scim-groups.service';
import { PrismaService } from '../../prisma/prisma.service';

const BASE = 'https://auth.example.com';
const org = { id: 'org-1', companyId: 'co-1' };
const role = {
  id: 'r1',
  organizationId: 'org-1',
  slug: 'engineers',
  name: 'Engineers',
  permissions: [],
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function setup(overrides: Record<string, unknown> = {}) {
  const prisma = {
    organization: { findUnique: jest.fn().mockResolvedValue(org) },
    orgRole: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(role),
      update: jest.fn().mockResolvedValue(role),
      delete: jest.fn().mockResolvedValue(role),
    },
    membership: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  };
  const svc = new ScimGroupsService(prisma as unknown as PrismaService);
  return { svc, prisma };
}

describe('ScimGroupsService', () => {
  it('creates a group (OrgRole) and assigns members', async () => {
    const { svc, prisma } = setup();
    const result = await svc.createGroup(
      'co-1',
      { displayName: 'Engineers', members: [{ value: 'u1' }] },
      BASE,
    );
    expect(prisma.orgRole.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'engineers', name: 'Engineers' }) }),
    );
    expect(prisma.membership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'engineers' } }),
    );
    expect(result.displayName).toBe('Engineers');
  });

  it('409s on a duplicate group slug', async () => {
    const { svc, prisma } = setup();
    prisma.orgRole.findFirst.mockResolvedValue(role);
    await expect(
      svc.createGroup('co-1', { displayName: 'Engineers' }, BASE),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('renders members on get', async () => {
    const { svc, prisma } = setup();
    prisma.orgRole.findFirst.mockResolvedValue(role);
    prisma.membership.findMany.mockResolvedValue([
      { userId: 'u1', user: { email: 'a@b.com' } },
    ]);
    const group = await svc.getGroup('co-1', 'r1', BASE);
    expect(group.members).toEqual([{ value: 'u1', display: 'a@b.com' }]);
  });

  it('404s on an unknown group', async () => {
    const { svc } = setup();
    await expect(svc.getGroup('co-1', 'nope', BASE)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('patches members: add + remove', async () => {
    const { svc, prisma } = setup();
    prisma.orgRole.findFirst.mockResolvedValue(role);
    await svc.patchGroup({
      companyId: 'co-1',
      id: 'r1',
      operations: [
        { op: 'add', path: 'members', value: [{ value: 'u2' }] },
        { op: 'remove', path: 'members[value eq "u3"]' },
      ],
      baseUrl: BASE,
    });
    // add → role slug; remove → back to 'member'
    expect(prisma.membership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: { in: ['u2'] } }), data: { role: 'engineers' } }),
    );
    expect(prisma.membership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: { in: ['u3'] } }), data: { role: 'member' } }),
    );
  });

  it('deletes a group and resets its members', async () => {
    const { svc, prisma } = setup();
    prisma.orgRole.findFirst.mockResolvedValue(role);
    await svc.deleteGroup('co-1', 'r1');
    expect(prisma.membership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1', role: 'engineers' }, data: { role: 'member' } }),
    );
    expect(prisma.orgRole.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });
});
