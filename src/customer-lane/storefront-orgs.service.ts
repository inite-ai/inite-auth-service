import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthAuditService } from '../audit/oauth-audit.service';
import {
  type LaneCaller,
  type OrgInput,
  type OrgView,
  OrgRefusal,
  assertSlug,
  companyIdFor,
  laneMetadata,
  ownedBy,
  viewOf,
} from './storefront-orgs';

const ORG_SELECT = { id: true, companyId: true, slug: true, name: true, metadata: true } as const;

/**
 * The database side of storefront orgs (rules in storefront-orgs.ts). Writes
 * the organizations table only: never memberships, roles or API keys.
 */
@Injectable()
export class StorefrontOrgsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly audit?: OAuthAuditService,
  ) {}

  /** PUT: create the tenant's org, or bring it to this slug, name and state. Idempotent. */
  async upsert(caller: LaneCaller, slug: string, input: OrgInput): Promise<OrgView> {
    assertSlug(slug, caller);
    const companyId = companyIdFor(caller.clientId, input.tenantId);
    try {
      const view = await this.prisma.$transaction(async (tx) => {
        const bySlug = await tx.organization.findUnique({ where: { slug }, select: ORG_SELECT });
        if (bySlug && (!ownedBy(bySlug, caller.clientId) || bySlug.companyId !== companyId)) {
          throw new OrgRefusal(409, 'slug_taken', 'Another organization has this slug');
        }
        const byTenant =
          bySlug ??
          (await tx.organization.findUnique({ where: { companyId }, select: ORG_SELECT }));
        if (byTenant && !ownedBy(byTenant, caller.clientId)) {
          throw new OrgRefusal(409, 'slug_taken', 'Another organization holds this tenant');
        }
        const data = {
          slug,
          name: input.name,
          metadata: laneMetadata(byTenant?.metadata, caller, input) as Prisma.InputJsonValue,
        };
        const row = byTenant
          ? await tx.organization.update({ where: { id: byTenant.id }, data, select: ORG_SELECT })
          : await tx.organization.create({ data: { ...data, companyId }, select: ORG_SELECT });
        return {
          view: viewOf(row),
          created: !byTenant,
          moved: !!byTenant && byTenant.slug !== slug,
        };
      });
      await this.record(caller, {
        slug,
        tenantId: input.tenantId,
        active: input.active,
        created: view.created,
        moved: view.moved,
      });
      return view.view;
    } catch (err) {
      // Two writers raced on the unique slug or companyId: the slug is someone's now.
      const refusal =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
          ? new OrgRefusal(409, 'slug_taken', 'Another organization has this slug')
          : err;
      if (refusal instanceof OrgRefusal)
        await this.record(caller, { slug, tenantId: input.tenantId }, refusal.code);
      throw refusal;
    }
  }

  /** GET: the caller's own orgs, for a product's backfill diff. */
  async list(caller: LaneCaller): Promise<OrgView[]> {
    const rows = await this.prisma.organization.findMany({
      where: {
        companyId: { startsWith: `${caller.clientId}:` },
        metadata: { path: ['customerLane', 'owner'], equals: caller.clientId },
      },
      select: ORG_SELECT,
      orderBy: { slug: 'asc' },
    });
    return rows.filter((r) => ownedBy(r, caller.clientId)).map(viewOf);
  }

  /** One audit row per upsert: success without `refused`, else the refusal code. */
  private record(caller: LaneCaller, metadata: Record<string, unknown>, refused?: string) {
    return (
      this.audit?.record({
        event: 'customer_lane.org_upsert',
        clientId: caller.clientId,
        scopes: ['customer-lane:orgs'],
        success: !refused,
        errorMessage: refused ?? null,
        metadata,
      }) ?? Promise.resolve()
    );
  }
}
