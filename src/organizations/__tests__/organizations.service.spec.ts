import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrganizationsService } from '../organizations.service';
import { AdminScope } from '../../admin/admin-scope';

const SUPERADMIN: AdminScope = { kind: 'superadmin' };
const SCOPED: AdminScope = { kind: 'scoped', companyId: 'acme' };

describe('OrganizationsService', () => {
  let prisma: any;
  let service: OrganizationsService;

  beforeEach(() => {
    prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'o1', ...data })),
        delete: jest.fn(),
      },
      orgRole: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new OrganizationsService(prisma);
  });

  it('applies the tenant filter for a scoped admin list', async () => {
    await service.list(SCOPED);
    expect(prisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'acme' }) }),
    );
  });

  it('blocks a scoped admin creating an org outside its tenant', async () => {
    await expect(service.create(SCOPED, { name: 'X', slug: 'other', companyId: 'other' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets a scoped admin create within its tenant', async () => {
    const org = await service.create(SCOPED, { name: 'Acme', slug: 'acme' } as any);
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
