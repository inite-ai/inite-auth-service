import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Organization, Membership, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityService } from '../identity/identity.service';
import { SsfEmitterService } from '../ssf/ssf-emitter.service';
import { CAEP_EVENTS } from '../ssf/caep-event-types';
import { ScimUser, ScimUserBody, ScimPatchOperation, scimListResponse } from './scim.contracts';
import { toScimUser, parseEqFilter, activeFromPatch, formatName } from './scim-support';

const DEFAULT_PAGE_SIZE = 100;

/**
 * SCIM 2.0 Users resource. A SCIM user is modeled as a local User plus its
 * Membership in the caller's tenant organization (resolved by companyId), so
 * provisioning is tenant-scoped: create = ensure-user + tenant membership,
 * deprovision (active=false / DELETE) = deactivate the membership and emit a
 * CAEP account-disabled event so downstream RSes revoke in near-real-time.
 */
@Injectable()
export class ScimUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly ssf: SsfEmitterService,
  ) {}

  async createUser(companyId: string, body: ScimUserBody, baseUrl: string): Promise<ScimUser> {
    const org = await this.resolveOrg(companyId);
    const email = this.requireUserName(body);

    const user =
      (await this.identity.getIdentityByEmail(email)) ??
      (await this.identity.createIdentity(email, formatName(body)));

    const existing = await this.findMembership(org.id, user.id);
    if (existing && existing.status === 'active') {
      throw new ConflictException(`user ${email} already provisioned in this tenant`);
    }

    const membership = existing
      ? await this.prisma.membership.update({
          where: { id: existing.id },
          data: { status: 'active', externalId: body.externalId ?? existing.externalId },
        })
      : await this.prisma.membership.create({
          data: {
            userId: user.id,
            organizationId: org.id,
            role: 'member',
            status: 'active',
            externalId: body.externalId ?? null,
          },
        });

    return toScimUser(user, membership, baseUrl);
  }

  async listUsers(
    companyId: string,
    query: { filter?: string; startIndex?: string; count?: string },
    baseUrl: string,
  ): Promise<Record<string, unknown>> {
    const org = await this.resolveOrg(companyId);
    const startIndex = Math.max(1, Number(query.startIndex) || 1);
    const count = Math.max(0, Number(query.count) || DEFAULT_PAGE_SIZE);

    const matched = await this.matchMemberships({
      orgId: org.id,
      filter: query.filter,
      startIndex,
      count,
    });
    const resources = matched.rows.map((m) => toScimUser(m.user, m, baseUrl));
    return scimListResponse({
      resources,
      totalResults: matched.total,
      startIndex,
      itemsPerPage: resources.length,
    });
  }

  async getUser(companyId: string, id: string, baseUrl: string): Promise<ScimUser> {
    const org = await this.resolveOrg(companyId);
    const membership = await this.loadMembershipOr404(org.id, id);
    return toScimUser(membership.user, membership, baseUrl);
  }

  /** PUT — replace mutable attributes (display name + active state). */
  async replaceUser(input: {
    companyId: string;
    id: string;
    body: ScimUserBody;
    baseUrl: string;
  }): Promise<ScimUser> {
    const org = await this.resolveOrg(input.companyId);
    const membership = await this.loadMembershipOr404(org.id, input.id);

    const name = formatName(input.body);
    if (name && name !== membership.user.name) {
      await this.prisma.user.update({ where: { id: input.id }, data: { name } });
    }
    const active = input.body.active ?? membership.status === 'active';
    const updated = await this.setActive({
      membership,
      companyId: org.companyId,
      active,
      externalId: input.body.externalId,
    });
    return toScimUser(
      { ...membership.user, name: name ?? membership.user.name },
      updated,
      input.baseUrl,
    );
  }

  /** PATCH — the RFC 7644 §3.5.2 op list; we honour the `active` toggle. */
  async patchUser(input: {
    companyId: string;
    id: string;
    operations: ScimPatchOperation[] | undefined;
    baseUrl: string;
  }): Promise<ScimUser> {
    const org = await this.resolveOrg(input.companyId);
    const membership = await this.loadMembershipOr404(org.id, input.id);

    const active = activeFromPatch(input.operations);
    const updated =
      active === undefined
        ? membership
        : await this.setActive({ membership, companyId: org.companyId, active });
    return toScimUser(membership.user, updated, input.baseUrl);
  }

  /** DELETE — deprovision from the tenant (soft: deactivate + CAEP event). */
  async deactivateUser(companyId: string, id: string): Promise<void> {
    const org = await this.resolveOrg(companyId);
    const membership = await this.loadMembershipOr404(org.id, id);
    await this.setActive({ membership, companyId: org.companyId, active: false });
  }

  // --- helpers -------------------------------------------------------------

  private async resolveOrg(companyId: string): Promise<Organization> {
    const org = await this.prisma.organization.findUnique({ where: { companyId } });
    if (!org) {
      throw new NotFoundException(`no organization provisioned for tenant ${companyId}`);
    }
    return org;
  }

  private requireUserName(body: ScimUserBody): string {
    const userName = body.userName ?? body.emails?.find((e) => e.value)?.value;
    if (!userName) {
      throw new BadRequestException('userName is required');
    }
    return userName;
  }

  private findMembership(orgId: string, userId: string): Promise<Membership | null> {
    return this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
  }

  private async loadMembershipOr404(
    orgId: string,
    userId: string,
  ): Promise<Membership & { user: User }> {
    const membership = await this.prisma.membership.findFirst({
      where: { organizationId: orgId, userId },
      include: { user: true },
    });
    if (!membership) throw new NotFoundException('user not found in this tenant');
    return membership;
  }

  /**
   * Flip a membership's active state. Deactivation emits a CAEP account-disabled
   * SET so subscribed resource servers revoke access in near-real-time.
   */
  private async setActive(input: {
    membership: Membership & { user: User };
    companyId: string;
    active: boolean;
    externalId?: string;
  }): Promise<Membership> {
    const { membership, companyId, active, externalId } = input;
    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: {
        status: active ? 'active' : 'inactive',
        ...(externalId !== undefined ? { externalId } : {}),
      },
    });
    if (!active && membership.status === 'active') {
      await this.ssf.emit({
        eventType: CAEP_EVENTS.accountDisabled,
        subject: membership.user.did,
        companyId,
        claims: { reason: 'scim_deprovision' },
      });
    }
    return updated;
  }

  /** Resolve the page of memberships (with users) matching an optional filter. */
  private async matchMemberships(input: {
    orgId: string;
    filter: string | undefined;
    startIndex: number;
    count: number;
  }): Promise<{ rows: Array<Membership & { user: User }>; total: number }> {
    const where = this.buildWhere(input.orgId, input.filter);
    const [rows, total] = await Promise.all([
      this.prisma.membership.findMany({
        where,
        include: { user: true },
        skip: input.startIndex - 1,
        take: input.count,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.membership.count({ where }),
    ]);
    return { rows, total };
  }

  private buildWhere(orgId: string, filter: string | undefined): Record<string, unknown> {
    const where: Record<string, unknown> = { organizationId: orgId };
    const parsed = parseEqFilter(filter);
    if (parsed?.attribute === 'externalid') {
      where.externalId = parsed.value;
    } else if (parsed?.attribute === 'username') {
      where.user = { email: parsed.value };
    }
    return where;
  }
}
