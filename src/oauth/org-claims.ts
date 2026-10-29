import type { ActClaim } from './agents.service';

export interface OrgClaimsInput {
  org?: string;
  orgId?: string;
  /** The person's role in the chosen org (Membership.role). */
  orgRole?: string;
  orgSlug?: string;
  /** The chosen org is the shared demo tenant (Organization.metadata.isDemo). */
  demo?: boolean;
}

/** Resolved org/role context for token claims (union of relational RBAC + legacy metadata.roles). */
export interface OrgContext extends OrgClaimsInput {
  roles: string[];
  /** Sanitized per-client claims (policy/packs) — see custom-claims.ts. */
  customClaims?: Record<string, string[]>;
  /** The agent the token is for, when the client is a third party. */
  act?: ActClaim;
}

/**
 * The tenant claims, the same in the access and the ID token. `org_id`
 * (Organization.id) is the family tenant every product keys its own tenant
 * row by; `org` stays Organization.companyId for brain and billing; `org_role`
 * is the person's role in that one org, never a platform role; `demo` marks
 * the shared demo tenant, which products treat as read-only.
 */
export function orgClaims(ctx: OrgClaimsInput): Record<string, unknown> {
  if (!ctx.org) return {};
  return {
    org: ctx.org,
    org_id: ctx.orgId,
    ...(ctx.orgSlug ? { org_slug: ctx.orgSlug } : {}),
    ...(ctx.orgRole ? { org_role: ctx.orgRole } : {}),
    ...(ctx.demo ? { demo: true } : {}),
  };
}
