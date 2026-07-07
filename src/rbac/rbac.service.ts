import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_ROLE_PERMISSIONS } from './permissions';

/**
 * Resolves a user's effective permissions within an organization from the
 * relational Membership + OrgRole model, falling back to the built-in system
 * role catalog when no custom OrgRole overrides the slug.
 */
@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async resolvePermissions(userId: string, organizationId: string): Promise<Set<string>> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!membership || membership.status !== 'active') return new Set();
    return this.permissionsForRole(organizationId, membership.role);
  }

  /** The active membership roles a user holds, keyed by organizationId. */
  async rolesForUser(userId: string): Promise<Array<{ organizationId: string; role: string }>> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, status: 'active' },
      select: { organizationId: true, role: true },
    });
    return memberships;
  }

  async permissionsForRole(organizationId: string, roleSlug: string): Promise<Set<string>> {
    const custom = await this.prisma.orgRole.findFirst({
      where: { organizationId, slug: roleSlug },
    });
    if (custom) return new Set(custom.permissions);
    return new Set(SYSTEM_ROLE_PERMISSIONS[roleSlug] ?? []);
  }
}
