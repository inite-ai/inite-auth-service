/**
 * The one demo tenant of the family: «Atlântica Group», an auth Organization
 * that every product's demo data hangs off. Owner, 28.10: «одна демо компания
 * с демо пользователями в auth все сиды на ней».
 *
 * The ids are fixed so every product's seed keys off the same org without
 * asking auth: a product loads its demo fixtures into the one local tenant
 * row whose authOrgId is DEMO_ORG_ID, and nowhere else. The same constants
 * live in @inite/demo (inite-shared) once that package exists; a test pins them.
 *
 * The personas are real auth users with no credential of any kind: no
 * password, no passkey, no federated identity, and an address under the
 * reserved `.invalid` TLD (RFC 2606), so no sign-in form, magic link or
 * provider can ever reach them. They get tokens only through the demo grant
 * (src/oauth/demo-grant.ts, behind DEMO_GRANT_ENABLED).
 */

export const DEMO_ORG_ID = 'a7a71c00-de00-4000-8000-000000000001';
export const DEMO_ORG_COMPANY_ID = 'co_demo_atlantica';
export const DEMO_ORG_SLUG = 'demo';
export const DEMO_ORG_NAME = 'Atlântica Group (demo)';

export interface DemoPersona {
  key: 'owner' | 'manager' | 'staff';
  email: string;
  name: string;
  /** Membership.role in the demo org. */
  orgRole: 'owner' | 'admin' | 'member';
}

export const DEMO_PERSONAS: readonly DemoPersona[] = [
  { key: 'owner', email: 'ana@demo.invalid', name: 'Ana Demo', orgRole: 'owner' },
  { key: 'manager', email: 'bruno@demo.invalid', name: 'Bruno Demo', orgRole: 'admin' },
  { key: 'staff', email: 'carla@demo.invalid', name: 'Carla Demo', orgRole: 'member' },
];

/** The marker a demo org and a demo persona carry in `metadata`. */
export const DEMO_METADATA = { isDemo: true } as const;

export function isDemoOrganization(org: { id?: string; metadata?: unknown } | null | undefined): boolean {
  if (!org) return false;
  if (org.id === DEMO_ORG_ID) return true;
  const m = org.metadata as { isDemo?: unknown } | null | undefined;
  return m?.isDemo === true;
}

export function isDemoPersonaEmail(email: string | null | undefined): boolean {
  return !!email && DEMO_PERSONAS.some((p) => p.email === email.toLowerCase());
}
