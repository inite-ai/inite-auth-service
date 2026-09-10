import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../common/settings/settings.service';
import {
  personalWorkspaceCompanyId,
  personalWorkspaceSlug,
  requestsProvisioningVertical,
} from './personal-workspace';

/**
 * Give a user with no organisation one, on first contact with a vertical
 * that provisions.
 *
 * Why this exists: the `org` claim is what a resource server reads as the
 * tenant, and a user who signed in from an MCP client has no membership
 * yet. Without a workspace the token carries no org, the resource server
 * has no tenant to scope to, and a correct OAuth flow ends in a 401 the
 * user cannot act on. `sub` cannot stand in — it is a DID, and tenant
 * identifiers are a narrower charset.
 *
 * Deliberately narrow: off unless the operator enables
 * PERSONAL_WORKSPACE_PROVISIONING_ENABLED, and even then only for a
 * request that asks for a provisioning vertical's scopes. One IdP serves
 * several products; the others keep the old behaviour exactly.
 */
@Injectable()
export class PersonalWorkspaceService {
  private readonly logger = new Logger(PersonalWorkspaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * The workspace for this user, creating it (and an owner membership)
   * when the flag and the requested scopes both call for it. Returns null
   * when provisioning does not apply or could not complete — never
   * throws, because a workspace we failed to create must not fail a
   * login. The caller degrades to a token with no org claim, which is
   * exactly the pre-flag behaviour, and the next request retries.
   *
   * Idempotent by construction: companyId is derived from the user id, so
   * a race loses to the unique index and re-reads instead of forking the
   * tenant.
   */
  async provisionFor(
    userId: string,
    scope: string | undefined,
  ): Promise<{ id: string; companyId: string } | null> {
    if (!this.settings.flag('PERSONAL_WORKSPACE_PROVISIONING_ENABLED')) return null;
    if (!requestsProvisioningVertical(scope)) return null;

    const companyId = personalWorkspaceCompanyId(userId);
    try {
      const organization = await this.prisma.organization.upsert({
        where: { companyId },
        update: {},
        create: {
          companyId,
          slug: personalWorkspaceSlug(userId),
          name: 'Personal workspace',
          metadata: { personal: true, provisionedFor: userId },
        },
        select: { id: true, companyId: true },
      });
      await this.prisma.membership.upsert({
        where: {
          userId_organizationId: { userId, organizationId: organization.id },
        },
        update: { status: 'active' },
        create: {
          userId,
          organizationId: organization.id,
          role: 'owner',
          status: 'active',
        },
      });
      return organization;
    } catch (err) {
      this.logger.warn(
        `personal workspace provisioning failed for user ${userId}: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
