import { User } from '@prisma/client';
import { resolveAdminScope } from '../admin/admin-scope';

/**
 * `platform_role: "superadmin"` for INITE's own operators, and nothing for
 * anyone else. Products used to read platform superadmin from `roles ∋
 * "admin"`, but `roles` also carries org membership roles (resolveOrgContext),
 * so the admin of one company became the operator of every product
 * (family auth plan, step 0). @inite/auth now promotes only on this claim.
 * The rule is the admin console's own (resolveAdminScope): user metadata,
 * never a membership.
 */
export function platformRoleClaim(user: Pick<User, 'metadata'>): { platform_role?: 'superadmin' } {
  const scope = resolveAdminScope({
    metadata: (user.metadata as Record<string, unknown> | null) ?? {},
  });
  return scope?.kind === 'superadmin' ? { platform_role: 'superadmin' } : {};
}
