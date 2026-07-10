import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrganizationsService } from '../organizations.service';
import { CreateOrganizationDto } from '../dto/create-organization.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminScope } from '../../admin/admin-scope';

const SUPERADMIN: AdminScope = { kind: 'superadmin' };
const SCOPED: AdminScope = { kind: 'scoped', companyId: 'acme' };

describe('OrganizationsService', () => {
  let prisma: {
    organization: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    orgRole: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: OrganizationsService;

  beforeEach(() => {
    prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'o1', ...data })),
        delete: jest.fn(),
      },
      orgRole: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'r1', ...data })),
      },
    };
    service = new OrganizationsService(prisma as unknown as PrismaService);
  });

  it('applies the tenant filter for a scoped admin list', async () => {
    await service.list(SCOPED);
    expect(prisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'acme' }) }),
    );
  });

  it('blocks a scoped admin creating an org outside its tenant', async () => {
    await expect(service.create(SCOPED, { name: 'X', slug: 'other', companyId: 'other' } as CreateOrganizationDto))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets a scoped admin create within its tenant', async () => {
    const org = await service.create(SCOPED, { name: 'Acme', slug: 'acme' } as CreateOrganizationDto);
    expect(org.companyId).toBe('acme');
  });

  it('404s when an org is out of scope', async () => {
    prisma.organization.findFirst.mockResolvedValue(null);
    await expect(service.get(SCOPED, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects creating a role that shadows a system role', async () => {
    prisma.organization.findFirst.mockResolvedValue({ id: 'o1', companyId: 'acme' });
    await expect(service.createRole(SUPERADMIN, 'o1', { slug: 'owner', name: 'Owner', permissions: [] }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects editing a system role', async () => {
    prisma.organization.findFirst.mockResolvedValue({ id: 'o1', companyId: 'acme' });
    await expect(service.updateRole(SUPERADMIN, 'o1', { slug: 'admin', name: 'Admin', permissions: ['org:*'] }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s when editing a custom role that does not exist', async () => {
    prisma.organization.findFirst.mockResolvedValue({ id: 'o1', companyId: 'acme' });
    prisma.orgRole.findFirst.mockResolvedValue(null);
    await expect(service.updateRole(SUPERADMIN, 'o1', { slug: 'auditor', name: 'Auditor', permissions: [] }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates a custom role name + permissions', async () => {
    prisma.organization.findFirst.mockResolvedValue({ id: 'o1', companyId: 'acme' });
    prisma.orgRole.findFirst.mockResolvedValue({ id: 'r1', organizationId: 'o1', slug: 'auditor' });
    const role = await service.updateRole(SUPERADMIN, 'o1', {
      slug: 'auditor',
      name: 'Senior Auditor',
      permissions: ['org:read', 'org:members:manage'],
    });
    expect(prisma.orgRole.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { name: 'Senior Auditor', permissions: ['org:read', 'org:members:manage'] },
    });
    expect(role.name).toBe('Senior Auditor');
  });
});
