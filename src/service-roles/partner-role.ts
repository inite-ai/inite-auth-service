/**
 * The partner role door: inite.ai approves a partner and puts two roles on
 * that person's account, `partner` (opens the partner cabinet) and
 * `partner:<code>` (whose referral links are theirs). Before this door it
 * needed the superadmin roles API, and a product holding superadmin would
 * own every family account; this door can write those two roles and nothing
 * else.
 *
 * The rules, all here so they read as one:
 *
 *   1. Only a machine token (client_credentials) with scope roles:partner,
 *      from an active client whose allowedScopes still list it
 *      (clients/<id>.json). A person's token never passes.
 *   2. The person is found by a verified email, exact and case-insensitive.
 *      None is 404 no-account: the door never creates a user. Two accounts
 *      that differ only by case are 409 ambiguous-account, never a guess.
 *   3. grant adds `partner` and `partner:<code>`; revoke removes
 *      `partner:<code>`, and `partner` only when no other `partner:*` is
 *      left. The code is ^[a-z0-9-]{2,32}$.
 *   4. Every other role stays as it is: admin, superadmin, other partner
 *      codes, anything. Only metadata.roles is written; isAdmin and every
 *      other metadata key are never touched.
 *   5. Idempotent: a grant of what is there, or a revoke of what is not,
 *      writes nothing and answers changed: false.
 *   6. Roles live in metadata.roles, which the token issuer reads at every
 *      issue (resolveOrgContext), so the next access token (a sign-in or a
 *      refresh) carries them.
 */

import { SERVICE_ROLE_SCOPES } from '../oauth/oauth-scopes.registry';

export const PARTNER_ROLE_SCOPE: (typeof SERVICE_ROLE_SCOPES)[number] = 'roles:partner';
export const PARTNER_ROLE = 'partner';

const CODE = /^[a-z0-9-]{2,32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;

export type PartnerAction = 'grant' | 'revoke';

export interface PartnerRoleInput {
  email: string;
  code: string;
  action: PartnerAction;
}

/** What the door answers: the partner roles the account holds now, never its other roles. */
export interface PartnerRoleView {
  userId: string;
  roles: string[];
  changed: boolean;
}

/** The caller, as the guard established it. */
export interface PartnerRoleCaller {
  clientId: string;
}

/** A refusal: HTTP status, stable code, plain description. */
export class PartnerRoleRefusal extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    public readonly code: string,
    description: string,
  ) {
    super(description);
    this.name = 'PartnerRoleRefusal';
  }
}

/** The body, checked. Anything else in it is ignored. */
export function parsePartnerRoleInput(body: unknown): PartnerRoleInput {
  const b =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!email || email.length > EMAIL_MAX || !EMAIL.test(email)) {
    throw new PartnerRoleRefusal(400, 'invalid_request', 'email is an email address');
  }
  if (typeof b.code !== 'string' || !CODE.test(b.code)) {
    throw new PartnerRoleRefusal(400, 'invalid_request', 'code is 2-32 of a-z, 0-9 or "-"');
  }
  if (b.action !== 'grant' && b.action !== 'revoke') {
    throw new PartnerRoleRefusal(400, 'invalid_request', 'action is "grant" or "revoke"');
  }
  return { email, code: b.code, action: b.action };
}

const isPartnerCode = (r: string) => /^partner:/i.test(r);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The roles stored on the account now (metadata.roles), strings only. */
export function storedRoles(metadata: unknown): string[] {
  const roles =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as { roles?: unknown }).roles
      : undefined;
  return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [];
}

/**
 * Rules 3-4: the roles after the action. Order and every other role are
 * kept. An account with no stored roles is issued ["user"] (the issuer's
 * fallback), so a grant starts from that and the token keeps saying "user".
 */
export function rolesAfter(
  current: readonly string[],
  code: string,
  action: PartnerAction,
): string[] {
  const own = `${PARTNER_ROLE}:${code}`;
  if (action === 'grant') {
    const out = current.length ? [...current] : ['user'];
    for (const r of [PARTNER_ROLE, own]) if (!out.some((x) => same(x, r))) out.push(r);
    return out;
  }
  const out = current.filter((r) => !same(r, own));
  return out.some(isPartnerCode) ? out : out.filter((r) => !same(r, PARTNER_ROLE));
}

/** The partner roles among `roles`: what the door shows its caller. */
export function partnerRolesOf(roles: readonly string[]): string[] {
  return roles.filter((r) => same(r, PARTNER_ROLE) || isPartnerCode(r));
}

/** Rule 5. */
export function sameRoles(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((r, i) => r === b[i]);
}
