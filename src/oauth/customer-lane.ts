/**
 * The customer lane: a tenant's own customers (a restaurant's guests, a
 * rental's booking customers, a shop's buyers) get INITE accounts through
 * auth, passwordless, holding a `customer` role in the company's org (owner
 * decision 29.10.2026; family auth plan §6.1).
 *
 * The rules, all in this file so they read as one:
 *
 *   1. Only a client marked `customerLane` (oauth_clients.customerLane, set
 *      from clients/<id>.json), only with CUSTOMER_LANE_ENABLED on, and only
 *      for a request marked `customer=1` (what @inite/auth's storefront login
 *      sends beside `organization=<slug>`). Without all three the parameters
 *      create nothing: the same product's staff login (no marker) is
 *      untouched, so a merchant is never turned into a customer.
 *   2. The hint names an existing, active org (`organization=<slug>`).
 *   3. The org must have the client: the client's own tenant
 *      (`client.companyId === org.companyId`), or the org lists it in
 *      `metadata.customerLane.clients`. A storefront of company A therefore
 *      cannot mint customers into company B: B has to name A's client.
 *   4. A person with no membership in the org gets `customer`, but only after
 *      a passwordless sign-in (email code or magic link, which also verified
 *      the address). A customer keeps signing in that way; a password session
 *      is sent back to the login screen instead.
 *   5. A staff member of the org (any role but `customer`) keeps their role:
 *      never downgraded to customer, never upgraded. A membership that is not
 *      active is refused, not revived.
 *   6. `customer` grants no permission (rbac/permissions.ts), is never put in
 *      the legacy `roles` array and never reaches `platform_role`, which is
 *      read from user metadata alone (platform-role-claim.ts).
 */

export const CUSTOMER_ROLE = 'customer';

/** RFC 8176 methods that prove control of the inbox without a password. */
const PASSWORDLESS_AMR = new Set(['otp', 'magic-link']);

/** Org slugs as the admin API creates them. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Statuses (Organization.metadata.status) that close an org to sign-in. */
const CLOSED_STATUSES = new Set(['inactive', 'suspended', 'archived', 'deleted']);

/** The org a lane request is for, as the code and the token need it. */
export interface LaneOrg {
  id: string;
  companyId: string;
  slug: string;
}

export interface LaneClient {
  clientId: string;
  companyId: string | null;
  customerLane: boolean;
}

export interface LaneOrgRow extends LaneOrg {
  metadata: unknown;
}

/** The customer-lane marker: '1' when sent as such, else undefined. */
export function normalizeCustomerMarker(raw: unknown): string | undefined {
  return raw === '1' || raw === 'true' ? '1' : undefined;
}

/** The hint as sent, or undefined when absent. Never trusted beyond a lookup key. */
export function normalizeOrganizationHint(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim().toLowerCase();
  return v ? v : undefined;
}

export function isSlug(v: string): boolean {
  return SLUG.test(v);
}

function metadataOf(org: { metadata: unknown }): Record<string, unknown> {
  const m = org.metadata;
  return m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

/** Rule 2: an org is open unless its metadata closes it. */
export function isOrganizationActive(org: { metadata: unknown }): boolean {
  const m = metadataOf(org);
  if (m.active === false) return false;
  return !(typeof m.status === 'string' && CLOSED_STATUSES.has(m.status));
}

/** Rule 3: the org has this client — its own tenant, or named in metadata.customerLane.clients. */
export function orgAllowsClient(org: LaneOrgRow, client: LaneClient): boolean {
  if (client.companyId && client.companyId === org.companyId) return true;
  const lane = metadataOf(org).customerLane;
  const clients =
    lane && typeof lane === 'object' ? (lane as { clients?: unknown }).clients : undefined;
  return Array.isArray(clients) && clients.includes(client.clientId);
}

/** Rule 4: the session was built without a password, by an email code or link. */
export function isPasswordlessSession(amr: readonly string[]): boolean {
  return !amr.includes('pwd') && amr.some((m) => PASSWORDLESS_AMR.has(m));
}

/**
 * Rules 4-5 for one person: what an existing membership (or none) means for
 * this sign-in.
 *   - `staff`: a non-customer active member, keeps the role, any sign-in.
 *   - `customer`: may sign in as a customer (an existing one, or a new one to add).
 *   - `passwordless`: would be a customer, but the session used a password.
 *   - `closed`: the membership exists and is not active.
 */
export type LaneVerdict = 'staff' | 'customer' | 'passwordless' | 'closed';

/**
 * The companyId a token is for: a lane client's granted org (the code's or
 * the refresh token's), else the client's own, as before the lane.
 */
export function tokenTenant(
  clientRow: { companyId: string | null; customerLane: boolean } | null,
  granted: string | null | undefined,
): string | null {
  if (clientRow?.customerLane && granted) return granted;
  return clientRow?.companyId ?? null;
}

/** Rule 6: the legacy `roles` array carries staff roles only; a customer's role is in org_role alone. */
export function staffRoles(memberships: ReadonlyArray<{ role: string }>): string[] {
  return memberships.map((m) => m.role).filter((r) => r !== CUSTOMER_ROLE);
}

export function laneVerdict(
  membership: { role: string; status: string } | null,
  amr: readonly string[],
): LaneVerdict {
  if (membership && membership.status !== 'active') return 'closed';
  if (membership && membership.role !== CUSTOMER_ROLE) return 'staff';
  return isPasswordlessSession(amr) ? 'customer' : 'passwordless';
}
