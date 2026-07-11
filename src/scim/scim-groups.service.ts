import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Organization, OrgRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScimGroup, ScimGroupBody, ScimPatchOperation, scimListResponse } from './scim.contracts';
import {
  toScimGroup,
  slugifyGroupName,
  groupPatchFromOps,
  memberValues,
  parseEqFilter,
} from './scim-support';

const DEFAULT_PAGE_SIZE = 100;

/**
 * SCIM 2.0 Groups resource. A SCIM Group maps to a tenant OrgRole; group
 * membership is a member's Membership.role matching the role slug. Because a
 * membership carries a single role, a user belongs to at most one SCIM group
 * per tenant — the honest mapping onto the existing relational-RBAC model.
 */
@Injectable()
export class ScimGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async createGroup(companyId: string, body: ScimGroupBody, baseUrl: string): Promise<ScimGroup> {
    const org = await this.resolveOrg(companyId);
    const displayName = body.displayName?.trim();
    if (!displayName) throw new BadRequestException('displayName is required');

    const slug = slugifyGroupName(displayName);
    const existing = await this.prisma.orgRole.findFirst({
      where: { organizationId: org.id, slug },
    });
    if (existing) throw new ConflictException(`group "${displayName}" already exists`);

    const role = await this.prisma.orgRole.create({
      data: { organizationId: org.id, slug, name: displayName, permissions: [] },
    });
    await this.assignMembers(org.id, slug, memberValues(body.members));
    return this.render(org.id, role, baseUrl);
  }

  async listGroups(
    companyId: string,
    query: { filter?: string; startIndex?: string; count?: string },
    baseUrl: string,
  ): Promise<Record<string, unknown>> {
    const org = await this.resolveOrg(companyId);
    const startIndex = Math.max(1, Number(query.startIndex) || 1);
    const count = Math.max(0, Number(query.count) || DEFAULT_PAGE_SIZE);

    const where = this.buildWhere(org.id, query.filter);
    const [roles, total] = await Promise.all([
      this.prisma.orgRole.findMany({ where, skip: startIndex - 1, take: count, orderBy: { createdAt: 'asc' } }),
      this.prisma.orgRole.count({ where }),
    ]);
    const resources = await Promise.all(roles.map((r) => this.render(org.id, r, baseUrl)));
    return scimListResponse({ resources, totalResults: total, startIndex, itemsPerPage: resources.length });
  }

  async getGroup(companyId: string, id: string, baseUrl: string): Promise<ScimGroup> {
    const org = await this.resolveOrg(companyId);
    const role = await this.loadRoleOr404(org.id, id);
    return this.render(org.id, role, baseUrl);
  }

  /** PUT — displayName + an authoritative member list. */
  async replaceGroup(input: {
    companyId: string;
    id: string;
    body: ScimGroupBody;
    baseUrl: string;
  }): Promise<ScimGroup> {
    const org = await this.resolveOrg(input.companyId);
    const role = await this.loadRoleOr404(org.id, input.id);
    const name = input.body.displayName?.trim();
    if (name && name !== role.name) {
      await this.prisma.orgRole.update({ where: { id: role.id }, data: { name } });
    }
    await this.setMembers(org.id, role.slug, memberValues(input.body.members));
    return this.render(org.id, { ...role, name: name ?? role.name }, input.baseUrl);
  }

  /** PATCH — displayName replace + member add/remove/replace. */
  async patchGroup(input: {
    companyId: string;
    id: string;
    operations: ScimPatchOperation[] | undefined;
    baseUrl: string;
  }): Promise<ScimGroup> {
    const org = await this.resolveOrg(input.companyId);
    const role = await this.loadRoleOr404(org.id, input.id);
    const patch = groupPatchFromOps(input.operations);

    let name = role.name;
    if (patch.displayName && patch.displayName !== role.name) {
      name = patch.displayName;
      await this.prisma.orgRole.update({ where: { id: role.id }, data: { name } });
    }
    if (patch.replaceMembers) await this.setMembers(org.id, role.slug, patch.replaceMembers);
    if (patch.addMembers.length) await this.assignMembers(org.id, role.slug, patch.addMembers);
    if (patch.removeMembers.length) await this.removeMembers(org.id, patch.removeMembers);
    return this.render(org.id, { ...role, name }, input.baseUrl);
  }

  /** DELETE — remove the role and reset its members back to the default role. */
  async deleteGroup(companyId: string, id: string): Promise<void> {
    const org = await this.resolveOrg(companyId);
    const role = await this.loadRoleOr404(org.id, id);
    await this.resetRole(org.id, role.slug);
    await this.prisma.orgRole.delete({ where: { id: role.id } });
  }

  // --- helpers -------------------------------------------------------------

  private async resolveOrg(companyId: string): Promise<Organization> {
    const org = await this.prisma.organization.findUnique({ where: { companyId } });
    if (!org) throw new NotFoundException(`no organization provisioned for tenant ${companyId}`);
    return org;
  }

  private async loadRoleOr404(orgId: string, id: string): Promise<OrgRole> {
    const role = await this.prisma.orgRole.findFirst({ where: { id, organizationId: orgId } });
    if (!role) throw new NotFoundException('group not found in this tenant');
    return role;
  }

  private async render(orgId: string, role: OrgRole, baseUrl: string): Promise<ScimGroup> {
    const members = await this.prisma.membership.findMany({
      where: { organizationId: orgId, role: role.slug },
      include: { user: true },
    });
    return toScimGroup(
      role,
      members.map((m) => ({ userId: m.userId, email: m.user.email })),
      baseUrl,
    );
  }

  private buildWhere(orgId: string, filter: string | undefined): Record<string, unknown> {
    const where: Record<string, unknown> = { organizationId: orgId };
    const parsed = parseEqFilter(filter);
    // Groups filter by displayName; reuse the eq parser's value slot.
    if (parsed && filter && /displayname/i.test(filter)) where.name = parsed.value;
    return where;
  }

  /** Assign a role to memberships that already exist in the org (no-op if absent). */
  private async assignMembers(orgId: string, slug: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.membership.updateMany({
      where: { organizationId: orgId, userId: { in: userIds } },
      data: { role: slug },
    });
  }

  private async removeMembers(orgId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.membership.updateMany({
      where: { organizationId: orgId, userId: { in: userIds } },
      data: { role: 'member' },
    });
  }

  /** Make the group's membership set authoritative: reset current, assign new. */
  private async setMembers(orgId: string, slug: string, userIds: string[]): Promise<void> {
    await this.resetRole(orgId, slug);
    await this.assignMembers(orgId, slug, userIds);
  }

  private async resetRole(orgId: string, slug: string): Promise<void> {
    await this.prisma.membership.updateMany({
      where: { organizationId: orgId, role: slug },
      data: { role: 'member' },
    });
  }
}
