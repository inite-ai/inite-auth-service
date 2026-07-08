// ===== types (mirror src/organizations service responses) =====

export interface Organization {
  id: string
  name: string
  slug: string
  companyId: string
  createdAt: string
  updatedAt?: string
}

export interface Membership {
  id: string
  userId: string
  organizationId: string
  role: string
  status: string
  createdAt: string
}

export interface OrgRoleView {
  slug: string
  name: string
  permissions: string[]
  system: boolean
}

// System roles the backend always exposes (src/rbac/permissions.ts). Kept in
// sync as the fallback set for the membership role picker before roles load.
export const SYSTEM_ROLES = ['owner', 'admin', 'member', 'viewer']

// Permission presets offered in the custom-role builder — the union of every
// permission the built-in roles use.
export const PERMISSION_PRESETS = [
  'org:*',
  'org:read',
  'org:members:manage',
  'org:roles:manage',
]
