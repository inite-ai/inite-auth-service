import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../common/settings/settings.service';
import { OAuthAuditService } from '../audit/oauth-audit.service';
import {
  CUSTOMER_ROLE,
  type LaneClient,
  type LaneOrg,
  type LaneVerdict,
  isOrganizationActive,
  isSlug,
  laneVerdict,
  normalizeCustomerMarker,
  normalizeOrganizationHint,
  orgAllowsClient,
} from './customer-lane';

/** Refusals of the hint itself, before anyone signs in. */
const UNKNOWN_ORG = {
  error: 'invalid_request',
  error_description: 'Unknown or inactive organization',
};
const NOT_BOUND = {
  error: 'unauthorized_client',
  error_description: 'This client may not sign in customers for that organization',
};

/**
 * The customer lane's database side (rules in customer-lane.ts): find the
 * hinted org for a lane client, and give a passwordless person a `customer`
 * membership in it.
 */
@Injectable()
export class CustomerLaneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Optional() private readonly audit?: OAuthAuditService,
  ) {}

  /**
   * The org a request is for, or null when the lane does not apply: the flag
   * is off, there is no hint, or the client is not a lane client (for those
   * the parameter creates nothing and is left alone), or the request is not
   * marked customer=1. Throws when a lane
   * client names an org that does not exist, is closed, or does not have it.
   */
  async orgFor(input: {
    client: LaneClient;
    organization?: string | null;
    customer?: string | null;
  }): Promise<LaneOrg | null> {
    const slug = normalizeOrganizationHint(input.organization);
    if (!slug || !normalizeCustomerMarker(input.customer) || !input.client.customerLane)
      return null;
    if (!this.settings.flag('CUSTOMER_LANE_ENABLED')) return null;
    if (!isSlug(slug)) throw new BadRequestException(UNKNOWN_ORG);
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true, companyId: true, slug: true, metadata: true },
    });
    if (!org || !isOrganizationActive(org)) throw new BadRequestException(UNKNOWN_ORG);
    if (!orgAllowsClient(org, input.client)) throw new BadRequestException(NOT_BOUND);
    return { id: org.id, companyId: org.companyId, slug: org.slug };
  }

  /** What this person's membership (or none) means for a sign-in with these methods. */
  async verdict(input: {
    userId: string;
    org: LaneOrg;
    amr: readonly string[];
  }): Promise<LaneVerdict> {
    return laneVerdict(await this.membershipOf(input.userId, input.org.id), input.amr);
  }

  /**
   * Let the person in as the org's customer, or as the staff member they
   * already are. Creates the `customer` membership when there is none.
   * Throws for a password session (customers are passwordless) and for a
   * membership that is not active.
   */
  async admit(input: {
    userId: string;
    clientId: string;
    org: LaneOrg;
    amr: readonly string[];
  }): Promise<{ role: string; created: boolean }> {
    const existing = await this.membershipOf(input.userId, input.org.id);
    const verdict = laneVerdict(existing, input.amr);
    if (verdict === 'closed') {
      throw new ForbiddenException({
        error: 'access_denied',
        error_description: 'Membership is not active',
      });
    }
    if (verdict === 'passwordless') {
      throw new UnauthorizedException({
        error: 'login_required',
        error_description: 'Customers sign in with an email code or a sign-in link',
      });
    }
    if (existing) return { role: existing.role, created: false };
    await this.assertEmailVerified(input.userId);
    const role = await this.createCustomer(input.userId, input.org.id);
    if (role === CUSTOMER_ROLE) await this.recordJoined(input);
    return { role, created: role === CUSTOMER_ROLE };
  }

  private membershipOf(userId: string, organizationId: string) {
    return this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { role: true, status: true },
    });
  }

  /** Belt and braces: the code or link verified the address; never add an unverified one. */
  private async assertEmailVerified(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });
    if (!user?.emailVerified) {
      throw new UnauthorizedException({
        error: 'login_required',
        error_description: 'Email address not verified',
      });
    }
  }

  /**
   * Insert the customer membership. A concurrent sign-in (or an admin adding
   * the person a moment earlier) wins the unique (userId, organizationId):
   * then the row that is there stands, whatever its role.
   */
  private async createCustomer(userId: string, organizationId: string): Promise<string> {
    try {
      await this.prisma.membership.create({
        data: { userId, organizationId, role: CUSTOMER_ROLE, status: 'active' },
      });
      return CUSTOMER_ROLE;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
      const row = await this.membershipOf(userId, organizationId);
      if (!row || row.status !== 'active') throw new ForbiddenException({ error: 'access_denied' });
      return row.role;
    }
  }

  private async recordJoined(input: {
    userId: string;
    clientId: string;
    org: LaneOrg;
  }): Promise<void> {
    await this.audit?.record({
      event: 'membership.customer.created',
      clientId: input.clientId,
      companyId: input.org.companyId,
      success: true,
      metadata: { userId: input.userId, organizationId: input.org.id },
    });
  }
}
