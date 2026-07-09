import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Organization, Membership, OrgRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminScope, applyScopeFilter } from '../admin/admin-scope';
import { SYSTEM_ROLE_PERMISSIONS } from '../rbac/permissions';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpsertMembershipDto } from './dto/upsert-membership.dto';
import { CreateRoleDto } from './dto/create-role.dto';

/**
 * Organization / membership / role CRUD, scoped to the admin operator's tenant
 * via applyScopeFilter so a company-scoped admin only sees/edits its own org.
 */
@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: AdminScope): Promise<Organization[]> {
    const where: Record<string, unknown> = {};
    applyScopeFilter(scope, where);
    return this.prisma.organization.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async create(scope: AdminScope, dto: CreateOrganizationDto): Promise<Organization> {
    const companyId = dto.companyId ?? dto.slug;
    if (scope.kind === 'scoped' && scope.companyId !== companyId) {
      throw new BadRequestException('cannot create an organization outside your tenant');
    }
    return this.prisma.organization.create({
      data: { name: dto.name, slug: dto.slug, companyId },
    });
  }

  async get(scope: AdminScope, orgId: string): Promise<Organization> {
    const where: Record<string, unknown> = { id: orgId };
    applyScopeFilter(scope, where);
    const org = await this.prisma.organization.findFirst({ where });
    if (!org) throw new NotFoundException('organization not found');
    return org;
  }

  async remove(scope: AdminScope, orgId: string): Promise<void> {
    await this.get(scope, orgId);
    await this.prisma.organization.delete({ where: { id: orgId } });
  }

  async listMembers(scope: AdminScope, orgId: string): Promise<Membership[]> {
    await this.get(scope, orgId);
    return this.prisma.membership.findMany({ where: { organizationId: orgId } });
  }

  async upsertMember(scope: AdminScope, orgId: string, dto: UpsertMembershipDto): Promise<Membership> {
    await this.get(scope, orgId);
    return this.prisma.membership.upsert({
      where: { userId_organizationId: { userId: dto.userId, organizationId: orgId } },
      create: { userId: dto.userId, organizationId: orgId, role: dto.role, status: dto.status ?? 'active' },
      update: { role: dto.role, status: dto.status ?? 'active' },
    });
  }

  async removeMember(scope: AdminScope, orgId: string, userId: string): Promise<void> {
    await this.get(scope, orgId);
    await this.prisma.membership.deleteMany({ where: { organizationId: orgId, userId } });
  }

  /** System roles (built-in) plus any custom OrgRole rows for the org. */
  async listRoles(scope: AdminScope, orgId: string): Promise<Array<{ slug: string; name: string; permissions: string[]; system: boolean }>> {
    await this.get(scope, orgId);
    const system = Object.entries(SYSTEM_ROLE_PERMISSIONS).map(([slug, permissions]) => ({
      slug, name: slug, permissions, system: true,
    }));
    const custom = await this.prisma.orgRole.findMany({ where: { organizationId: orgId } });
    return [...system, ...custom.map((r) => ({ slug: r.slug, name: r.name, permissions: r.permissions, system: false }))];
  }

  async createRole(scope: AdminScope, orgId: string, dto: CreateRoleDto): Promise<OrgRole> {
    await this.get(scope, orgId);
    if (SYSTEM_ROLE_PERMISSIONS[dto.slug]) {
      throw new BadRequestException(`"${dto.slug}" is a reserved system role`);
    }
    return this.prisma.orgRole.create({
      data: { organizationId: orgId, slug: dto.slug, name: dto.name, permissions: dto.permissions },
    });
  }
}
