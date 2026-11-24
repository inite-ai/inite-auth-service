import { adminTier, hasSuperadminRole, SUPERADMIN_ROLE } from './admin-scope';

/** The columns the superadmin CLI reads; `metadata` is the raw JSON column. */
export interface SuperadminRow {
  id: string;
  email: string | null;
  emailVerified: boolean;
  metadata: unknown;
}

export type GrantPlan =
  | { kind: 'grant'; id: string; metadata: Record<string, unknown> }
  | { kind: 'already'; id: string }
  | { kind: 'refuse'; reason: string };

export function metadataOf(row: Pick<SuperadminRow, 'metadata'>): Record<string, unknown> {
  const raw = row.metadata;
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/**
 * What granting the role to one account would write. The operator names the
 * account twice, by id and by email, and both have to be the same verified
 * row: an address alone can be re-registered, an id alone is easy to mistype.
 */
export function planGrant(
  rows: SuperadminRow[],
  target: { id: string; email: string },
): GrantPlan {
  if (!target.id || !target.email) {
    return { kind: 'refuse', reason: 'both --id and --email are required' };
  }
  const row = rows.find((r) => r.id === target.id);
  if (!row) return { kind: 'refuse', reason: `no account with id ${target.id}` };
  if (row.email !== target.email) {
    return { kind: 'refuse', reason: 'the id and the email are not the same account' };
  }
  if (!row.emailVerified) return { kind: 'refuse', reason: "the account's email is not verified" };

  const metadata = metadataOf(row);
  if (hasSuperadminRole(metadata)) return { kind: 'already', id: row.id };
  const roles = Array.isArray(metadata.roles) ? metadata.roles : [];
  return {
    kind: 'grant',
    id: row.id,
    metadata: { ...metadata, roles: [...roles, SUPERADMIN_ROLE] },
  };
}

/**
 * Whether the role can become the only source of superadmin without locking
 * everybody out: `holders` have it on a verified account, `losing` are admins
 * with neither the role nor a company. A database with no admin at all passes
 * (create-admin runs after the first boot).
 */
export function preflight(rows: SuperadminRow[]): {
  ok: boolean;
  holders: SuperadminRow[];
  losing: SuperadminRow[];
} {
  const tierOf = (r: SuperadminRow) => adminTier(metadataOf(r));
  const holders = rows.filter((r) => r.emailVerified && tierOf(r) === 'superadmin');
  const losing = rows.filter((r) => tierOf(r) === 'unscoped');
  const admins = rows.some((r) => tierOf(r) !== null);
  return { ok: holders.length > 0 || !admins, holders, losing };
}
