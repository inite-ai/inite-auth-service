import { createHash } from 'node:crypto';

/**
 * Naming for the workspace a user gets on first contact with a vertical
 * that provisions one.
 *
 * Derived from the user id rather than random, so the operation is
 * idempotent: two token requests racing each other compute the same
 * companyId and the unique index turns the loser into a re-read instead
 * of a second workspace. 16 hex characters of SHA-256 is 64 bits — far
 * past collision range for a user table, and short enough to read.
 *
 * The shape matters beyond aesthetics. Resource servers validate the
 * `org` claim against an identifier charset (brain's is
 * `^[A-Za-z0-9_-]{1,64}$`), which a raw user id — a DID, with colons —
 * would fail. This is the reason the claim cannot simply carry `sub`.
 */
export const PERSONAL_WORKSPACE_PREFIX = 'co_u_';

export function personalWorkspaceCompanyId(userId: string): string {
  const digest = createHash('sha256').update(userId).digest('hex').slice(0, 16);
  return `${PERSONAL_WORKSPACE_PREFIX}${digest}`;
}

/** Slug is unique alongside companyId; keep them in lockstep. */
export function personalWorkspaceSlug(userId: string): string {
  return personalWorkspaceCompanyId(userId).replace(/_/g, '-');
}

/** True when this workspace was created by the personal-provisioning path. */
export function isPersonalWorkspace(companyId: string): boolean {
  return companyId.startsWith(PERSONAL_WORKSPACE_PREFIX);
}

/**
 * The OAuth clients whose sign-in provisions a workspace by default: the
 * family products that sell a plan to an organisation (billing subscriber
 * `org:<org_id>`, owner decision 31.10.2026). Their sign-in asks for plain
 * OIDC scopes, so the brain-scope test below never fires for them, and a
 * brand-new customer would reach checkout with no org and be refused.
 * Operators override the list with PERSONAL_WORKSPACE_CLIENTS.
 */
export const DEFAULT_PERSONAL_WORKSPACE_CLIENTS =
  'inite-rent,inite-education,inite-ai,ideaudit-dashboard';

/** Parse a comma-separated client list (blank entries dropped). */
export function parseClientList(csv: string | undefined): string[] {
  return (csv ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Which requests provision on first use. Deliberately not "any request":
 * one IdP serves several products, and only the ones that can create a
 * tenant out of nothing should do so. Two ways in:
 * - the request asks for a brain scope (an MCP client's first contact);
 * - the request comes from a listed client (a product whose plan is bought
 *   by an organisation).
 * Anything else gets the old behaviour: no org claim, no workspace.
 */
export function requestsProvisioningVertical(
  scope: string | undefined,
  clientId?: string,
  provisioningClients: readonly string[] = [],
): boolean {
  if (clientId && provisioningClients.includes(clientId)) return true;
  return (scope ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .some((s) => s.startsWith('brain:'));
}
