'use client'

import { motion } from 'framer-motion'
import { Users, AppWindow, Key, Wallet, RefreshCw, UserPlus } from 'lucide-react'

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

const statCards = [
  { key: 'totalUsers', label: 'Users', icon: Users, color: 'from-violet-500 to-fuchsia-500' },
  { key: 'totalClients', label: 'OAuth Clients', icon: AppWindow, color: 'from-cyan-500 to-blue-500' },
  { key: 'totalPasskeys', label: 'Passkeys', icon: Key, color: 'from-emerald-500 to-teal-500' },
  { key: 'totalWallets', label: 'Wallets', icon: Wallet, color: 'from-amber-500 to-orange-500' },
  { key: 'activeTokens', label: 'Active Sessions', icon: RefreshCw, color: 'from-rose-500 to-pink-500' },
  { key: 'recentUsers', label: 'New (7d)', icon: UserPlus, color: 'from-indigo-500 to-purple-500' },
] as const

export default function StatsSection({ stats }: StatsSectionProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {statCards.map((card, i) => (
        <motion.div
          key={card.key}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 border border-slate-700/50"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 bg-gradient-to-br ${card.color} rounded-xl flex items-center justify-center`}>
              <card.icon className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm text-slate-400">{card.label}</span>
          </div>
          <p className="text-3xl font-bold text-white">
            {(stats[card.key] ?? 0).toLocaleString()}
          </p>
        </motion.div>
      ))}
    </div>
  )
}
