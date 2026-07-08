'use client'

import { Fragment } from 'react'
import {
  FileSearch,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  Inbox,
} from 'lucide-react'
import { Badge } from '@/components/ui'
import { AuditRow, eventBadgeVariant, formatRelative } from './types'
import { ExpandedDetail } from './expanded-detail'

export function ResultsTable({
  rows,
  loading,
  pagination,
  activeFilterCount,
  openIds,
  toggleRow,
  onPage,
}: {
  rows: AuditRow[]
  loading: boolean
  pagination: { page: number; limit: number; total: number; pages: number }
  activeFilterCount: number
  openIds: Set<string>
  toggleRow: (id: string) => void
  onPage: (page: number) => void
}) {
  return (
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
              onClick={() => onPage(pagination.page - 1)}
              className="p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.pages}
              onClick={() => onPage(pagination.page + 1)}
              className="p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
