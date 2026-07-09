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
    orgRole: { create: jest.Mock; findMany: jest.Mock };
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
      orgRole: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
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
});
