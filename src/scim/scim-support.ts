import { ForbiddenException } from '@nestjs/common';
import { User, Membership } from '@prisma/client';
import { ScimUser, SCIM_SCHEMAS } from './scim.contracts';

/**
 * The machine principal fields SCIM reads. SCIM is tenant-scoped: every request
 * carries a company-scoped M2M token, and all reads/writes stay within that
 * tenant's organization.
 */
export interface ScimPrincipal {
  kind?: string;
  companyId?: string | null;
  scope?: unknown;
}

/**
 * Resolve the caller's tenant (companyId). SCIM only makes sense against a
 * single tenant, so a token without a companyId is rejected rather than
 * silently operating cross-tenant.
 */
export function resolveScimTenant(principal: ScimPrincipal | undefined): string {
  const companyId = principal?.companyId;
  if (typeof companyId !== 'string' || companyId.length === 0) {
    throw new ForbiddenException('SCIM requires a tenant-scoped (companyId) token');
  }
  return companyId;
}

/**
 * Parse the subset of RFC 7644 §3.4.2.2 filter grammar provisioning clients
 * actually use: `userName eq "value"` (also `externalId eq "value"`). Returns
 * the matched attribute + value, or null when there's no supported filter.
 */
export function parseEqFilter(
  filter: string | undefined,
): { attribute: string; value: string } | null {
  if (!filter) return null;
  const match = /^\s*(userName|externalId)\s+eq\s+"([^"]*)"\s*$/i.exec(filter);
  if (!match) return null;
  return { attribute: match[1]!.toLowerCase(), value: match[2]! };
}

/** Map a local User + its tenant Membership onto the SCIM User wire shape. */
export function toScimUser(
  user: User,
  membership: Pick<Membership, 'status' | 'externalId'>,
  baseUrl: string,
): ScimUser {
  return {
    schemas: [SCIM_SCHEMAS.user],
    id: user.id,
    ...(membership.externalId ? { externalId: membership.externalId } : {}),
    userName: user.email ?? user.did,
    ...(user.name
      ? { name: { formatted: user.name }, displayName: user.name }
      : {}),
    ...(user.email
      ? { emails: [{ value: user.email, primary: true }] }
      : {}),
    active: membership.status === 'active',
    meta: {
      resourceType: 'User',
      created: user.createdAt.toISOString(),
      lastModified: user.updatedAt.toISOString(),
      location: `${baseUrl}/scim/v2/Users/${user.id}`,
    },
  };
}

/**
 * Extract the desired `active` state from a SCIM PATCH body. Handles the two
 * shapes Okta/Entra send: a targeted `{op:'replace', path:'active', value}` and
 * an untargeted `{op:'replace', value:{active}}`. Returns undefined when no
 * operation touches `active`.
 */
export function activeFromPatch(
  operations: Array<{ op: string; path?: string; value?: unknown }> | undefined,
): boolean | undefined {
  if (!operations) return undefined;
  let result: boolean | undefined;
  for (const op of operations) {
    const value = activeFromOperation(op);
    if (value !== undefined) result = value;
  }
  return result;
}

/** The `active` value a single PATCH op sets, or undefined if it doesn't. */
function activeFromOperation(op: {
  op: string;
  path?: string;
  value?: unknown;
}): boolean | undefined {
  const kind = op.op?.toLowerCase();
  if (kind !== 'replace' && kind !== 'add') return undefined;
  if (op.path?.toLowerCase() === 'active') return coerceBool(op.value);
  if (!op.path && typeof op.value === 'object' && op.value !== null) {
    const active = (op.value as Record<string, unknown>).active;
    if (active !== undefined) return coerceBool(active);
  }
  return undefined;
}

function coerceBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 'True';
}

/**
 * Derive a display name from a SCIM body: prefer `name.formatted`, then
 * `displayName`, then a `givenName familyName` join. Returns undefined when the
 * body carries no name so callers leave the stored value untouched.
 */
export function formatName(body: {
  name?: { formatted?: string; givenName?: string; familyName?: string };
  displayName?: string;
}): string | undefined {
  const formatted = body.name?.formatted?.trim();
  if (formatted) return formatted;
  const display = body.displayName?.trim();
  if (display) return display;
  const joined = [body.name?.givenName, body.name?.familyName]
    .filter((p) => typeof p === 'string' && p.trim().length > 0)
    .join(' ')
    .trim();
  return joined.length > 0 ? joined : undefined;
}
