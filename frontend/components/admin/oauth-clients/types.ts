import { AppWindow, Globe, Server, Cpu } from 'lucide-react'

// Relative "3m ago" formatting is shared across admin tables.
export { formatRelative } from '../form-controls'

export interface OAuthClient {
  clientId: string
  name: string
  redirectUris: string[]
  allowedScopes: string[]
  allowedGrants: string[]
  allowedAudiences: string[]
  companyId?: string | null
  backchannelLogoutUri?: string | null
  active: boolean
  logoUrl?: string | null
  tokenEndpointAuthMethod?: string | null
  jwks?: unknown
  jwksUri?: string | null
  isPublic?: boolean
  createdAt: string
  updatedAt?: string
  // Loaded on demand for the details panel.
  stats?: {
    totalAuthCodes: number
    totalTokens: number
    activeTokens: number
  }
}

// What flavour of client are we looking at? Derived from allowedGrants
// — drives the icon, the badge, and the filter chip.
export type ClientType = 'web' | 'm2m' | 'device' | 'hybrid' | 'unknown'

export function detectType(grants: string[] = []): ClientType {
  const hasAuth = grants.includes('authorization_code')
  const hasRefresh = grants.includes('refresh_token')
  const hasCc = grants.includes('client_credentials')
  const hasDevice = grants.includes(
    'urn:ietf:params:oauth:grant-type:device_code',
  )
  const userFlow = hasAuth || hasRefresh
  const flavors = [
    userFlow && !hasCc && !hasDevice,
    hasCc && !userFlow && !hasDevice,
    hasDevice && !userFlow && !hasCc,
  ]
  if (flavors.filter(Boolean).length === 1) {
    if (flavors[0]) return 'web'
    if (flavors[1]) return 'm2m'
    if (flavors[2]) return 'device'
  }
  if (!grants.length) return 'unknown'
  return 'hybrid'
}

export const typeMeta: Record<
  ClientType,
  { label: string; icon: typeof AppWindow; color: 'accent' | 'success' | 'warning' | 'neutral' }
> = {
  web: { label: 'Web app', icon: Globe, color: 'accent' },
  m2m: { label: 'M2M', icon: Server, color: 'success' },
  device: { label: 'Device', icon: Cpu, color: 'warning' },
  hybrid: { label: 'Hybrid', icon: AppWindow, color: 'neutral' },
  unknown: { label: '—', icon: AppWindow, color: 'neutral' },
}

export const GRANT_OPTIONS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'authorization_code', label: 'Authorization Code', hint: 'User-flow apps with PKCE' },
  { id: 'refresh_token', label: 'Refresh Token', hint: 'Long-lived sessions' },
  { id: 'client_credentials', label: 'Client Credentials', hint: 'Service-to-service M2M, no user' },
  {
    id: 'urn:ietf:params:oauth:grant-type:device_code',
    label: 'Device Code',
    hint: 'TV / CLI / IoT — user authorises on a second device',
  },
]

export const SCOPE_PRESETS = [
  'openid', 'profile', 'email', 'offline_access', 'wallet', 'admin',
  'brain:read', 'brain:write', 'brain:admin', 'brain:read_pii',
]

export const AUDIENCE_PRESETS = ['brain', 'inbox', 'assistant', 'admin-panel']

export type SortKey = 'name' | 'type' | 'scopes' | 'status' | 'created'
export type SortDir = 'asc' | 'desc'

export type TypeFilter = 'all' | ClientType
export type StatusFilter = 'all' | 'active' | 'inactive'

export function decodeJwtSegment(seg: string): any {
  try {
    const norm = seg.replace(/-/g, '+').replace(/_/g, '/')
    const padded = norm.padEnd(norm.length + ((4 - (norm.length % 4)) % 4), '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}
