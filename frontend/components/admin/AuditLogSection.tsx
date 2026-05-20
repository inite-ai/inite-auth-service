'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  FileSearch,
  Filter,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'

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

// Event vocab pulled from backend audit service docblock — keep
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
  const [successFilter, setSuccessFilter] = useState<'all' | 'true' | 'false'>('all')
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')

  const config = { headers: { Authorization: `Bearer ${accessToken}` } }

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
      } catch (err: any) {
        toast.error('Failed to load audit log')
      } finally {
        setLoading(false)
      }
    },
    [accessToken, event, clientId, companyId, successFilter, since, until],
  )

  useEffect(() => {
    load(1)
  }, [load])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-violet-400" />
          <h3 className="text-white font-semibold">Filters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Event</label>
            <select
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm"
            >
              <option value="">(all)</option>
              {COMMON_EVENTS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Client ID</label>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="smart-chat-brain"
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm placeholder-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Company ID (superadmin only)
            </label>
            <input
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              placeholder="co_acme"
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm placeholder-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Success</label>
            <select
              value={successFilter}
              onChange={(e) => setSuccessFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm"
            >
              <option value="all">All</option>
              <option value="true">Success only</option>
              <option value="false">Failures only</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Since</label>
            <input
              type="datetime-local"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Until</label>
            <input
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm"
            />
          </div>
        </div>

        <button
          onClick={() => load(1)}
          className="mt-4 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-lg text-sm font-medium hover:opacity-90 transition"
        >
          Apply filters
        </button>
      </div>

      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-800/50">
          <div className="flex items-center gap-2">
            <FileSearch className="w-5 h-5 text-violet-400" />
            <h3 className="text-white font-semibold">
              OAuth Audit Log
              <span className="ml-2 text-sm text-slate-400">
                ({pagination.total.toLocaleString()} rows)
              </span>
            </h3>
          </div>
          {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
        </div>

        {rows.length === 0 && !loading ? (
          <div className="p-12 text-center text-slate-400">
            No audit rows match these filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/30 text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Timestamp</th>
                  <th className="px-4 py-3 text-left">Event</th>
                  <th className="px-4 py-3 text-left">Client</th>
                  <th className="px-4 py-3 text-left">Subject</th>
                  <th className="px-4 py-3 text-left">Scopes</th>
                  <th className="px-4 py-3 text-left">IP</th>
                  <th className="px-4 py-3 text-center">Result</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-800/30 hover:bg-slate-800/20"
                  >
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      <Clock className="w-3 h-3 inline mr-1 text-slate-500" />
                      {new Date(r.ts).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{r.event}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs">{r.clientId ?? '—'}</div>
                      {r.companyId && (
                        <div className="text-[10px] text-slate-500">
                          tenant: {r.companyId}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono">{r.sub ?? '—'}</div>
                      {r.audience && (
                        <div className="text-[10px] text-slate-500">
                          aud: {r.audience}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {r.scopes?.length ? r.scopes.join(' ') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                      {r.ip ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 inline" />
                      ) : (
                        <span title={r.errorMessage ?? ''}>
                          <XCircle className="w-4 h-4 text-rose-400 inline" />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-800/50">
            <span className="text-sm text-slate-400">
              Page {pagination.page} of {pagination.pages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => load(pagination.page - 1)}
                className="p-2 bg-slate-800/50 text-slate-300 rounded-lg hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={pagination.page >= pagination.pages}
                onClick={() => load(pagination.page + 1)}
                className="p-2 bg-slate-800/50 text-slate-300 rounded-lg hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
