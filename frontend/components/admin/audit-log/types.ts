export interface AuditRow {
  id: string
  ts: string
  event: string
  clientId: string | null
  companyId: string | null
  sub: string | null
  scopes: string[]
  audience: string | null
  ip: string | null
  userAgent: string | null
  success: boolean
  errorMessage: string | null
  metadata: any
}

// Event vocab pulled from backend audit service docblock. Keep
// in sync with src/audit/oauth-audit.service.ts.
export const COMMON_EVENTS = [
  'token.issued.authorization_code',
  'token.issued.client_credentials',
  'token.issued.device_code',
  'token.refreshed',
  'token.failed.invalid_credentials',
  'token.failed.scope_violation',
  'token.failed.audience_violation',
  'token.failed.unsupported_grant',
  'token.failed.dpop_invalid',
  'client.created',
  'client.updated',
  'client.deactivated',
  'client.deleted',
  'client.secret_rotated',
]

export type SuccessFilter = 'all' | 'true' | 'false'

/** Columns the audit list may be sorted by (must match the backend whitelist). */
export type AuditSortColumn = 'ts' | 'event' | 'clientId' | 'sub' | 'success'

export function eventBadgeVariant(event: string, success: boolean) {
  if (!success) return 'danger' as const
  if (event.startsWith('client.')) return 'accent' as const
  if (event.startsWith('token.refreshed')) return 'neutral' as const
  return 'success' as const
}

export function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime()
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
