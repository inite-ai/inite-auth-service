'use client'

import { Plus, Search, Inbox } from 'lucide-react'
import { TypeFilter, StatusFilter } from './types'
import { FilterChipGroup } from './shared'

interface Counts {
  byType: Record<TypeFilter, number>
  active: number
  inactive: number
}

export function Toolbar({
  search,
  onSearch,
  typeFilter,
  onTypeFilter,
  statusFilter,
  onStatusFilter,
  counts,
  total,
  onNew,
}: {
  search: string
  onSearch: (v: string) => void
  typeFilter: TypeFilter
  onTypeFilter: (v: TypeFilter) => void
  statusFilter: StatusFilter
  onStatusFilter: (v: StatusFilter) => void
  counts: Counts
  total: number
  onNew: () => void
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search box */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-faint)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search name, id, tenant…"
            className="h-8 pl-8 pr-3 w-56 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40"
          />
        </div>

        {/* Type chips */}
        <FilterChipGroup
          value={typeFilter}
          onChange={(v) => onTypeFilter(v as TypeFilter)}
          options={[
            { value: 'all', label: 'All', count: counts.byType.all },
            { value: 'web', label: 'Web', count: counts.byType.web },
            { value: 'm2m', label: 'M2M', count: counts.byType.m2m },
            { value: 'device', label: 'Device', count: counts.byType.device },
          ]}
        />

        {/* Status chips */}
        <FilterChipGroup
          value={statusFilter}
          onChange={(v) => onStatusFilter(v as StatusFilter)}
          options={[
            { value: 'all', label: 'Any', count: total },
            { value: 'active', label: 'Active', count: counts.active },
            {
              value: 'inactive',
              label: 'Inactive',
              count: counts.inactive,
            },
          ]}
        />
      </div>

      <button
        type="button"
        onClick={onNew}
        className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
        New client
      </button>
    </div>
  )
}

export function EmptyState({
  total,
  onNew,
}: {
  total: number
  onNew: () => void
}) {
  return (
    <div className="p-12 text-center">
      <Inbox className="w-7 h-7 mx-auto text-[var(--text-faint)] mb-3" />
      <p className="text-sm font-medium text-[var(--text)]">
        {total === 0 ? 'No OAuth clients yet' : 'No clients match these filters'}
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {total === 0
          ? 'Register your first app or service to start issuing tokens.'
          : 'Try a different filter or clear the search box.'}
      </p>
      {total === 0 && (
        <button
          type="button"
          onClick={onNew}
          className="mt-4 h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
        >
          <Plus className="w-3.5 h-3.5" />
          New client
        </button>
      )}
    </div>
  )
}
