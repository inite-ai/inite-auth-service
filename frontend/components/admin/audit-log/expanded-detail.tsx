'use client'

import { AuditRow } from './types'

export function ExpandedDetail({ row }: { row: AuditRow }) {
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
