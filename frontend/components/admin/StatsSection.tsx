'use client'

import {
  Users,
  AppWindow,
  Key,
  Wallet,
  RefreshCw,
  UserPlus,
} from 'lucide-react'

interface Stats {
  totalUsers: number
  totalClients: number
  totalPasskeys: number
  totalWallets: number
  activeTokens: number
  recentUsers: number
}

interface StatsSectionProps {
  stats: Stats
}

const statCards: Array<{
  key: keyof Stats
  label: string
  icon: typeof Users
  hint: string
}> = [
  { key: 'totalUsers', label: 'Users', icon: Users, hint: 'all-time' },
  { key: 'totalClients', label: 'OAuth clients', icon: AppWindow, hint: 'active + inactive' },
  { key: 'totalPasskeys', label: 'Passkeys', icon: Key, hint: 'registered devices' },
  { key: 'totalWallets', label: 'Wallets', icon: Wallet, hint: 'linked addresses' },
  { key: 'activeTokens', label: 'Active sessions', icon: RefreshCw, hint: 'non-revoked refresh tokens' },
  { key: 'recentUsers', label: 'New (7d)', icon: UserPlus, hint: 'past week' },
]

export default function StatsSection({ stats }: StatsSectionProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {statCards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.key}
            className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-4"
          >
            <div className="flex items-center gap-2 mb-3 text-[var(--text-muted)]">
              <Icon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">{card.label}</span>
            </div>
            <div className="text-2xl font-semibold text-[var(--text)] tracking-tight tabular-nums">
              {(stats[card.key] ?? 0).toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-faint)]">
              {card.hint}
            </div>
          </div>
        )
      })}
    </div>
  )
}
