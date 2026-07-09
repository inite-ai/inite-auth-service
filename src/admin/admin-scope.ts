/**
 * Resolve the tenant scope an admin operator is allowed to read.
 *
 * Two admin tiers, distinguished by JWT metadata:
 *
 *   - **Superadmin**: `metadata.roles` includes `"superadmin"`, OR
 *     `metadata.isSuperadmin === true`. Sees all tenants.
 *   - **Scoped admin**: regular admin (`metadata.isAdmin` or
 *     `metadata.roles: ["admin"]`) with `metadata.companyId` set. Only
 *     sees that company.
 *
 * Returning `{ companyId: undefined }` means "no filter" (superadmin).
 * Returning `{ companyId: string }` means scoped admin.
 * Returning `null` means the operator has no admin claim at all — caller
 * should 403; in practice AdminGuard already blocks that path.
 *
 * Why a separate helper: every admin read that touches tenant-scoped
 * tables (audit log, refresh tokens, authz codes) needs the same
 * scoping logic. Centralising it stops the next endpoint from being
 * the one that leaks cross-tenant.
 */
export type AdminScope =
  | { kind: 'superadmin' }
  | { kind: 'scoped'; companyId: string };

/**
 * Loose shape of the authenticated principal (JWT `req.user`) that scope
 * resolution reads. Kept permissive — both the `user` and `machine` token
 * variants (and test fixtures) satisfy it — so every field is optional.
 */
export interface AdminScopePrincipal {
  kind?: string;
  scope?: unknown;
  companyId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function resolveAdminScope(
  user: AdminScopePrincipal | null | undefined,
): AdminScope | null {
  if (user?.kind === 'machine') {
    return resolveMachineScope(user);
  }
  return resolveUserScope(user);
}

/**
 * Machine principal (M2M token) — admin-scoped service. If the calling
 * OAuth client has a companyId stamped, treat the tool as scoped to that
 * tenant; otherwise it's a cross-tenant admin service (rare, used by
 * INITE's own automation).
 */
function resolveMachineScope(user: AdminScopePrincipal): AdminScope | null {
  const scope = user.scope instanceof Set ? user.scope : new Set<string>();
  if (!scope.has('admin')) return null;
  if (typeof user.companyId === 'string' && user.companyId.length > 0) {
    return { kind: 'scoped', companyId: user.companyId };
  }
  return { kind: 'superadmin' };
}

function resolveUserScope(
  user: AdminScopePrincipal | null | undefined,
): AdminScope | null {
  const metadata: Record<string, unknown> = user?.metadata ?? {};
  const roles: string[] = Array.isArray(metadata.roles) ? metadata.roles : [];

  const isSuperadmin =
    metadata.isSuperadmin === true || roles.includes('superadmin');
  if (isSuperadmin) return { kind: 'superadmin' };

  const isAdmin = metadata.isAdmin === true || roles.includes('admin');
  if (!isAdmin) return null;

  if (typeof metadata.companyId === 'string' && metadata.companyId.length > 0) {
    return { kind: 'scoped', companyId: metadata.companyId };
  }

  // Legacy admins without companyId stamping are treated as
  // superadmin for back-compat. Once admin provisioning sets
  // companyId universally, this branch can be removed.
  return { kind: 'superadmin' };
}

/**
 * Apply scope to a Prisma where-clause builder. Mutates `where` in
 * place when the operator is scoped; no-op for superadmin.
 *
 * Use this anywhere a list endpoint reads tenant-keyed rows. Forgetting
 * to call this is exactly the cross-tenant leak the audit warned about.
 */
export function applyScopeFilter(
  scope: AdminScope,
  where: Record<string, unknown>,
): void {
  if (scope.kind === 'scoped') {
    where.companyId = scope.companyId;
  }
}
