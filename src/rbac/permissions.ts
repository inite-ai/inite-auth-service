/**
 * Built-in system roles and their permission sets. Defined in code (not only
 * seeded in the DB) so RBAC works in fresh/`db push` environments where the
 * migration seed never runs. Custom per-org roles live in the OrgRole table
 * and override a slug when present.
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ['org:*'],
  admin: ['org:read', 'org:members:manage', 'org:roles:manage'],
  member: ['org:read'],
  viewer: ['org:read'],
};

/**
 * Does the granted permission set satisfy `required`? Supports a trailing
 * `:*` wildcard (e.g. `org:*` grants `org:members:manage`) and a bare `*`
 * super-grant.
 */
export function hasPermission(granted: Set<string>, required: string): boolean {
  if (granted.has('*') || granted.has(required)) return true;
  for (const g of granted) {
    if (g.endsWith(':*') && required.startsWith(g.slice(0, -1))) return true;
  }
  return false;
}
