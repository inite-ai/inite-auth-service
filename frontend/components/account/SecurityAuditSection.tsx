'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  ShieldAlert,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Globe,
  Smartphone,
} from 'lucide-react'
import api from '@/lib/api'

interface AuditEvent {
  id: string
  ts: string
  event: string
  success: boolean
  errorMessage: string | null
  ip: string | null
  userAgent: string | null
  clientId: string | null
  scopes: string[]
  audience: string | null
}

interface Props {
  accessToken: string
}

const EVENT_META: Record<
  string,
  { label: string; icon: typeof Activity; tone: 'good' | 'warn' | 'info' }
> = {
  'auth.login.password': { label: 'Signed in with password', icon: KeyRound, tone: 'good' },
  'auth.login.failed': { label: 'Failed sign-in attempt', icon: ShieldAlert, tone: 'warn' },
  'auth.flood.ip_blocked': { label: 'IP blocked (too many distinct accounts probed)', icon: ShieldAlert, tone: 'warn' },
  'identity.password.changed': { label: 'Password changed', icon: KeyRound, tone: 'good' },
  'token.issued.authorization_code': { label: 'App access granted (OAuth)', icon: CheckCircle2, tone: 'info' },
  'token.refreshed': { label: 'Session token refreshed', icon: RefreshCw, tone: 'info' },
  'token.failed.invalid_credentials': { label: 'App authentication failed', icon: XCircle, tone: 'warn' },
}

function describeEvent(eventName: string) {
  const meta = EVENT_META[eventName]
  if (meta) return meta
  return { label: eventName, icon: Activity, tone: 'info' as const }
}

function shortAgent(ua: string | null): string {
  if (!ua) return 'unknown device'
  if (/Mobi|Android/i.test(ua)) return 'mobile'
  if (/Mac/.test(ua)) return 'macOS'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Linux/.test(ua)) return 'Linux'
  return 'browser'
}

export default function SecurityAuditSection({ accessToken }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data } = await api.get('/auth/security/audit?limit=20', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!cancelled) setEvents(data.rows ?? [])
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.message ?? 'Failed to load audit events')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [accessToken])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent activity</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Last 20 security-relevant events on your account
            </p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-gray-100 dark:bg-gray-700/60 animate-pulse" />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
          No activity yet.
        </p>
      )}

      {!loading && !error && events.length > 0 && (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {events.map((evt) => {
            const meta = describeEvent(evt.event)
            const Icon = meta.icon
            const toneClass =
              meta.tone === 'warn'
                ? 'text-amber-600 dark:text-amber-400'
                : meta.tone === 'good'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-violet-600 dark:text-violet-400'

            return (
              <li key={evt.id} className="py-3 flex items-start gap-3">
                <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${toneClass}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {meta.label}
                    </span>
                    <time className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                      {new Date(evt.ts).toLocaleString()}
                    </time>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    {evt.ip && (
                      <span className="inline-flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {evt.ip}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Smartphone className="w-3 h-3" />
                      {shortAgent(evt.userAgent)}
                    </span>
                    {evt.clientId && (
                      <span className="font-mono">app: {evt.clientId.slice(0, 16)}…</span>
                    )}
                    {evt.errorMessage && (
                      <span className="text-amber-600 dark:text-amber-400">{evt.errorMessage}</span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </motion.div>
  )
}
