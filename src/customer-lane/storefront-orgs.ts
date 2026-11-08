/**
 * Storefront orgs (issue #304): a customer-lane client keeps the orgs of its
 * own tenants (a shop's stores, a restaurant app's venues, a club app's
 * clubs) so «Войти через INITE» on a storefront finds an active org that
 * names it (src/oauth/customer-lane.ts, rules 2-3).
 *
 * The rules, all here so they read as one:
 *
 *   1. Only a machine token (client_credentials) with scope
 *      customer-lane:orgs, from a client that is active, customerLane and has
 *      a customerLanePrefix (clients/<id>.json). Nothing else may call.
 *   2. The slug is an org slug and starts with the caller's prefix, so two
 *      products never collide on the family-wide unique slug.
 *   3. companyId = "<clientId>:<tenantId>": one org per tenant, never a real
 *      company id, so the lane's own-tenant rule never confuses it with one.
 *   4. An org is changed only by the client that owns it
 *      (metadata.customerLane.owner, and its companyId under the caller's
 *      namespace); any other org with that slug is 409 slug_taken. A tenant
 *      keeps its org when its storefront slug changes: the org is found by
 *      companyId and its slug moves.
 *   5. Only name, slug and metadata.{customerLane,status} are written.
 *      Memberships, roles and API keys are never read or written.
 *   6. active: false sets metadata.status "inactive", which closes the org to
 *      customer sign-in (isOrganizationActive); true reopens it.
 */
import { isSlug } from '../oauth/customer-lane';

export const ORGS_SCOPE = 'customer-lane:orgs';

const TENANT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const NAME_MAX = 200;

/** What a product sends for one tenant. */
export interface OrgInput {
  name: string;
  tenantId: string;
  active: boolean;
}

/** What auth answers for one org: the shape @inite/auth/storefrontOrgs reads. */
export interface OrgView {
  slug: string;
  name: string;
  tenantId: string;
  active: boolean;
}

/** The caller, as the guard established it. */
export interface LaneCaller {
  clientId: string;
  prefix: string;
}

/** A refusal: HTTP status, stable code, plain description. */
export class OrgRefusal extends Error {
  constructor(
    public readonly status: 400 | 403 | 409,
    public readonly code: string,
    description: string,
  ) {
    super(description);
    this.name = 'OrgRefusal';
  }
}

/** Rule 3. */
export function companyIdFor(clientId: string, tenantId: string): string {
  return `${clientId}:${tenantId}`;
}

/** Rule 2: a well-formed slug under the caller's prefix, with something after it. */
export function assertSlug(slug: string, caller: LaneCaller): void {
  if (!isSlug(slug)) throw new OrgRefusal(400, 'invalid_slug', 'Not an organization slug');
  if (!slug.startsWith(caller.prefix) || slug.length === caller.prefix.length) {
    throw new OrgRefusal(
      400,
      'invalid_slug',
      `This client's organization slugs start with "${caller.prefix}"`,
    );
  }
}

/** The body, checked. Anything else in it is ignored. */
export function parseOrgInput(body: unknown): OrgInput {
  const b =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name || name.length > NAME_MAX)
    throw new OrgRefusal(400, 'invalid_request', `name is 1-${NAME_MAX} characters`);
  if (typeof b.tenantId !== 'string' || !TENANT_ID.test(b.tenantId)) {
    throw new OrgRefusal(400, 'invalid_request', 'tenantId is 1-128 letters, digits, "_" or "-"');
  }
  if (b.active !== undefined && typeof b.active !== 'boolean')
    throw new OrgRefusal(400, 'invalid_request', 'active is a boolean');
  return { name, tenantId: b.tenantId, active: b.active !== false };
}

function metadataOf(m: unknown): Record<string, unknown> {
  return m && typeof m === 'object' && !Array.isArray(m)
    ? { ...(m as Record<string, unknown>) }
    : {};
}

/** Rule 4: the org belongs to this caller. */
export function ownedBy(org: { companyId: string; metadata: unknown }, clientId: string): boolean {
  const lane = metadataOf(org.metadata).customerLane;
  const owner = lane && typeof lane === 'object' ? (lane as { owner?: unknown }).owner : undefined;
  return owner === clientId && org.companyId.startsWith(`${clientId}:`);
}

/** Rules 5-6: the metadata to write, keeping every other key the org has. */
export function laneMetadata(
  existing: unknown,
  caller: LaneCaller,
  input: OrgInput,
): Record<string, unknown> {
  return {
    ...metadataOf(existing),
    customerLane: { clients: [caller.clientId], owner: caller.clientId, tenantId: input.tenantId },
    status: input.active ? 'active' : 'inactive',
  };
}

/** An org row as the product sees it. */
export function viewOf(org: { slug: string; name: string; metadata: unknown }): OrgView {
  const m = metadataOf(org.metadata);
  const lane =
    m.customerLane && typeof m.customerLane === 'object'
      ? (m.customerLane as { tenantId?: unknown })
      : {};
  return {
    slug: org.slug,
    name: org.name,
    tenantId: typeof lane.tenantId === 'string' ? lane.tenantId : '',
    active: m.status !== 'inactive',
  };
}
