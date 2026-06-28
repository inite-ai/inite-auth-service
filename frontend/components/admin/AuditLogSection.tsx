'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import {
  FileSearch,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  Search,
  X,
  Inbox,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Badge } from '@/components/ui'

interface AuditLogSectionProps {
  accessToken: string
}

interface AuditRow {
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
const COMMON_EVENTS = [
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

type SuccessFilter = 'all' | 'true' | 'false'

function eventBadgeVariant(event: string, success: boolean) {
  if (!success) return 'danger' as const
  if (event.startsWith('client.')) return 'accent' as const
  if (event.startsWith('token.refreshed')) return 'neutral' as const
  return 'success' as const
}

function formatRelative(iso: string): string {
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

export default function AuditLogSection({ accessToken }: AuditLogSectionProps) {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0,
  })
  const [loading, setLoading] = useState(true)

  // Filters
  const [event, setEvent] = useState('')
  const [clientId, setClientId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [successFilter, setSuccessFilter] = useState<SuccessFilter>('all')
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')

  // Expanded row IDs (multi-open allowed)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  const config = useMemo(
    () => ({ headers: { Authorization: `Bearer ${accessToken}` } }),
    [accessToken],
  )

  const load = useCallback(
    async (page = 1) => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('limit', '50')
        if (event) params.set('event', event)
        if (clientId) params.set('clientId', clientId)
        if (companyId) params.set('companyId', companyId)
        if (successFilter !== 'all') params.set('success', successFilter)
        if (since) params.set('since', new Date(since).toISOString())
        if (until) params.set('until', new Date(until).toISOString())

        const res = await api.get(`/admin/audit-log?${params.toString()}`, config)
        setRows(res.data.rows)
        setPagination(res.data.pagination)
      } catch {
        toast.error('Failed to load audit log')
      } finally {
        setLoading(false)
      }
    },
    [config, event, clientId, companyId, successFilter, since, until],
  )

  useEffect(() => {
    load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, clientId, companyId, successFilter, since, until])

  const resetFilters = () => {
    setEvent('')
    setClientId('')
    setCompanyId('')
    setSuccessFilter('all')
    setSince('')
    setUntil('')
  }

  const toggleRow = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const activeFilterCount = [
    event,
    clientId,
    companyId,
    successFilter !== 'all' ? successFilter : '',
    since,
    until,
  ].filter(Boolean).length

  const fieldClass =
    'w-full h-8 px-2.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40'

  return (
    <div className="space-y-4">
      {/* Filters card */}
      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-[var(--text)]">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="text-xs font-medium">Filters</span>
            {activeFilterCount > 0 && (
              <Badge variant="accent">{activeFilterCount} active</Badge>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Clear all
            </button>
          )}
        </div>

        {/* Success chips */}
        <div className="mb-3">
          <div className="inline-flex p-0.5 bg-[var(--bg)] border border-[var(--border)] rounded-md">
            {(['all', 'true', 'false'] as SuccessFilter[]).map((v) => {
              const active = successFilter === v
              const label =
                v === 'all' ? 'All' : v === 'true' ? 'Success only' : 'Failures only'
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSuccessFilter(v)}
                  className={`h-7 px-2.5 text-xs rounded transition-colors ${
                    active
                      ? 'bg-[var(--bg-overlay)] text-[var(--text)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div>
            <label className="block text-[11px] text-[var(--text-muted)] mb-1">
              Event
            </label>
            <select
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              className={`${fieldClass} font-mono`}
            >
              <option value="">(all events)</option>
              {COMMON_EVENTS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[var(--text-muted)] mb-1">
              Client ID
            </label>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="smart-chat-brain"
              className={`${fieldClass} font-mono`}
            />
          </div>

          <div>
            <label className="block text-[11px] text-[var(--text-muted)] mb-1">
              Company ID
              <span className="ml-1 text-[var(--text-faint)]">superadmin</span>
            </label>
            <input
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              placeholder="co_acme"
              className={`${fieldClass} font-mono`}
            />
          </div>

          <div>
            <label className="block text-[11px] text-[var(--text-muted)] mb-1">
              Since
            </label>
            <input
              type="datetime-local"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div>
            <label className="block text-[11px] text-[var(--text-muted)] mb-1">
              Until
            </label>
            <input
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
      </div>

      {/* Result table */}
      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 text-[var(--text)]">
            <FileSearch className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="text-xs font-medium">OAuth audit log</span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {pagination.total.toLocaleString()} rows
            </span>
          </div>
          {loading && (
            <Loader2 className="w-3.5 h-3.5 text-[var(--text-faint)] animate-spin" />
          )}
        </div>

        {!loading && rows.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="w-7 h-7 mx-auto text-[var(--text-faint)] mb-3" />
            <p className="text-sm font-medium text-[var(--text)]">
              No audit rows match these filters
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {activeFilterCount > 0
                ? 'Try clearing some filters or widening the time range.'
                : 'Events will appear here as tokens are issued and clients are managed.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
                  <th className="px-3 py-2 font-medium w-8"></th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Subject</th>
                  <th className="px-3 py-2 font-medium">Scopes</th>
                  <th className="px-3 py-2 font-medium">IP</th>
                  <th className="px-3 py-2 font-medium text-center">Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const open = openIds.has(r.id)
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => toggleRow(r.id)}
                        className={`border-b border-[var(--border)] hover:bg-[var(--bg-overlay)]/60 cursor-pointer transition-colors ${
                          open ? 'bg-[var(--bg-overlay)]/40' : ''
                        }`}
                      >
                        <td className="px-3 py-2 align-top">
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-[var(--text-faint)] transition-transform ${
                              open ? 'rotate-180' : ''
                            }`}
                          />
                        </td>
                        <td className="px-3 py-2 text-[11px] text-[var(--text-muted)] whitespace-nowrap align-top">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-[var(--text-faint)]" />
                            {formatRelative(r.ts)}
                          </div>
                          <div className="text-[10px] text-[var(--text-faint)] mt-0.5">
                            {new Date(r.ts).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Badge
                            variant={eventBadgeVariant(r.event, r.success)}
                            mono
                          >
                            {r.event}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="text-[11px] text-[var(--text)] font-mono">
                            {r.clientId ?? '—'}
                          </div>
                          {r.companyId && (
                            <div className="text-[10px] text-[var(--text-faint)]">
                              tenant: {r.companyId}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="text-[11px] text-[var(--text)] font-mono truncate max-w-[180px]">
                            {r.sub ?? '—'}
                          </div>
                          {r.audience && (
                            <div className="text-[10px] text-[var(--text-faint)]">
                              aud: {r.audience}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-[var(--text-muted)] align-top font-mono">
                          {r.scopes?.length ? r.scopes.join(' ') : '—'}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-[var(--text-muted)] font-mono align-top whitespace-nowrap">
                          {r.ip ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-center align-top">
                          {r.success ? (
                            <CheckCircle2 className="w-4 h-4 text-[color:var(--success)] inline" />
                          ) : (
                            <XCircle
                              className="w-4 h-4 text-[color:var(--danger)] inline"
                              aria-label={r.errorMessage ?? 'failure'}
                            />
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40">
                          <td colSpan={8} className="px-4 py-3">
                            <ExpandedDetail row={r} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border)]">
            <span className="text-xs text-[var(--text-muted)]">
              Page {pagination.page} of {pagination.pages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => load(pagination.page - 1)}
                className="p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.pages}
                onClick={() => load(pagination.page + 1)}
                className="p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ExpandedDetail({ row }: { row: AuditRow }) {
  return (
    <div className="space-y-3">
      {!row.success && row.errorMessage && (
        <div className="bg-[color:var(--danger)]/5 border border-[color:var(--danger)]/30 rounded-md px-3 py-2 text-xs text-[color:var(--danger)]">
          {row.errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {row.userAgent && (
          <KV label="User agent" value={row.userAgent} />
        )}
        {row.audience && <KV label="Audience" value={row.audience} mono />}
        {row.sub && <KV label="Subject" value={row.sub} mono />}
        {row.companyId && <KV label="Company" value={row.companyId} mono />}
      </div>

      {row.metadata && Object.keys(row.metadata ?? {}).length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">
            Metadata
          </div>
          <pre className="text-[11px] font-mono text-[var(--text)] bg-[var(--bg)] border border-[var(--border)] rounded-md p-2.5 overflow-x-auto">
            {JSON.stringify(row.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function KV({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)] mb-0.5">
        {label}
      </div>
      <div
        className={`text-xs text-[var(--text)] truncate ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value}
      </div>
    </div>
  )
}
