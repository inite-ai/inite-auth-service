import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { User, Membership, OrgRole } from '@prisma/client';
import { ScimUser, ScimGroup, SCIM_SCHEMAS } from './scim.contracts';

/** Absolute base URL for SCIM `meta.location`, honouring the terminating proxy. */
export function scimBaseUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol ?? 'https';
  const host = req.headers.host ?? '';
  return `${proto}://${host}`;
}

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

/** Map a tenant OrgRole + its member users onto the SCIM Group wire shape. */
export function toScimGroup(
  role: OrgRole,
  members: Array<{ userId: string; email: string | null }>,
  baseUrl: string,
): ScimGroup {
  return {
    schemas: [SCIM_SCHEMAS.group],
    id: role.id,
    displayName: role.name,
    members: members.map((m) => ({
      value: m.userId,
      ...(m.email ? { display: m.email } : {}),
    })),
    meta: {
      resourceType: 'Group',
      created: role.createdAt.toISOString(),
      location: `${baseUrl}/scim/v2/Groups/${role.id}`,
    },
  };
}

/** Normalize a Group displayName into a role slug (lowercase, dash-joined). */
export function slugifyGroupName(displayName: string): string {
  // Split on non-alphanumeric runs and rejoin — avoids the trailing-dash trim
  // regex, whose `-+$` alternative backtracks quadratically on adversarial
  // input (ReDoS). This form is single-pass and has no leading/trailing dashes.
  const slug = displayName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-');
  return slug.length > 0 ? slug : 'group';
}

/** The structured effect of a Group PATCH: displayName + member add/remove/replace. */
export interface GroupPatch {
  displayName?: string;
  addMembers: string[];
  removeMembers: string[];
  replaceMembers?: string[];
}

/** Reduce a SCIM Group PATCH op list into a structured GroupPatch. */
export function groupPatchFromOps(
  operations: Array<{ op: string; path?: string; value?: unknown }> | undefined,
): GroupPatch {
  const patch: GroupPatch = { addMembers: [], removeMembers: [] };
  for (const op of operations ?? []) applyGroupOp(op, patch);
  return patch;
}

function applyGroupOp(
  op: { op: string; path?: string; value?: unknown },
  patch: GroupPatch,
): void {
  const kind = op.op?.toLowerCase();
  const path = (op.path ?? '').toLowerCase();
  if (path === 'displayname' && (kind === 'replace' || kind === 'add')) {
    if (typeof op.value === 'string') patch.displayName = op.value;
    return;
  }
  if (path.startsWith('members')) applyMemberOp(kind, op, patch);
}

function applyMemberOp(
  kind: string | undefined,
  op: { path?: string; value?: unknown },
  patch: GroupPatch,
): void {
  const filtered = /members\[value eq "([^"]+)"\]/i.exec(op.path ?? '');
  if (kind === 'remove') {
    if (filtered) patch.removeMembers.push(filtered[1]!);
    else patch.removeMembers.push(...memberValues(op.value));
  } else if (kind === 'replace') {
    patch.replaceMembers = memberValues(op.value);
  } else if (kind === 'add') {
    patch.addMembers.push(...memberValues(op.value));
  }
}

/** Extract member user ids from a SCIM members value (array of {value}). */
export function memberValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((m) => (m && typeof m === 'object' ? (m as { value?: unknown }).value : undefined))
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
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
