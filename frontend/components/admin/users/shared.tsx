'use client'

import { Badge } from '@/components/ui'
import type { AdminTier, UserRow, RoleFilter } from './types'

export function initialAvatar(user: UserRow): string {
  return (
    user.name?.[0]?.toUpperCase() ??
    user.email?.[0]?.toUpperCase() ??
    '?'
  )
}

const TIERS: Record<
  Exclude<AdminTier, 'superadmin'>,
  { label: string; variant: 'accent' | 'warning' | 'danger' | 'neutral'; title: string }
> = {
  superadmin_implicit: {
    label: 'superadmin without the role',
    variant: 'warning',
    title:
      'An admin with no company, counted as a superadmin for now. Add the superadmin role, or set a company, to keep access.',
  },
  company: {
    label: 'company admin',
    variant: 'neutral',
    title: 'Sees one company only',
  },
  unscoped: {
    label: 'admin with no access',
    variant: 'danger',
    title:
      'Marked an admin, but with neither the superadmin role nor a company: the console refuses this account.',
  },
}

/** The account's place in the console, as the server reads it. */
export function TierBadge({ tier }: { tier?: AdminTier | null }) {
  // The explicit role shows as its own badge already.
  if (!tier || tier === 'superadmin') return null
  const { label, variant, title } = TIERS[tier]
  return (
    <span title={title}>
      <Badge variant={variant}>{label}</Badge>
    </span>
  )
}

export function RoleChips({
  value,
  onChange,
  counts,
  total,
}: {
  value: RoleFilter
  onChange: (v: RoleFilter) => void
  counts: { admins: number; users: number }
  total: number
}) {
  const opts: { value: RoleFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: total },
    { value: 'admin', label: 'Admins', count: counts.admins },
    { value: 'user', label: 'Users', count: counts.users },
  ]
  return (
    <div className="inline-flex p-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md">
      {opts.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`h-7 px-2.5 inline-flex items-center gap-1.5 text-xs rounded transition-colors ${
              active
                ? 'bg-[var(--bg-overlay)] text-[var(--text)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {o.label}
            <span
              className={`text-[10px] font-mono ${
                active ? 'text-[var(--text-muted)]' : 'text-[var(--text-faint)]'
              }`}
            >
              {o.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function IconButton({
  title,
  onClick,
  children,
  variant = 'default',
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  variant?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] transition-colors ${
        variant === 'danger'
          ? 'hover:text-[color:var(--danger)]'
          : 'hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
  )
}

export function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">
        {title}
      </div>
      {children}
    </div>
  )
}

export function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-3 text-center">
      <div className="mb-1 inline-flex items-center justify-center w-6 h-6 rounded-md bg-[var(--bg-overlay)] text-[var(--text-muted)]">
        {icon}
      </div>
      <div className="text-base font-semibold text-[var(--text)]">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
        {label}
      </div>
    </div>
  )
}
