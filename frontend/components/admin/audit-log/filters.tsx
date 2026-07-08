'use client'

import { Search, X } from 'lucide-react'
import { Badge } from '@/components/ui'
import { COMMON_EVENTS, SuccessFilter } from './types'

const fieldClass =
  'w-full h-8 px-2.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40'

export function Filters({
  event,
  setEvent,
  clientId,
  setClientId,
  companyId,
  setCompanyId,
  successFilter,
  setSuccessFilter,
  since,
  setSince,
  until,
  setUntil,
  activeFilterCount,
  onReset,
}: {
  event: string
  setEvent: (v: string) => void
  clientId: string
  setClientId: (v: string) => void
  companyId: string
  setCompanyId: (v: string) => void
  successFilter: SuccessFilter
  setSuccessFilter: (v: SuccessFilter) => void
  since: string
  setSince: (v: string) => void
  until: string
  setUntil: (v: string) => void
  activeFilterCount: number
  onReset: () => void
}) {
  return (
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
            onClick={onReset}
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
  )
}
