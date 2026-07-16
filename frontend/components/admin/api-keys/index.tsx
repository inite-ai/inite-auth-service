'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Loader2, KeyRound, Ban } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Badge, ConfirmDialog, SkeletonRow, CopyButton } from '@/components/ui'
import { formatRelative } from '../form-controls'
import CreateKeyPanel from './create-key-panel'
import { NewKeyDialog } from './new-key-dialog'

interface AdminApiKey {
  id: string
  prefix: string
  name: string
  companyId: string
  audience: string
  scopes: string[]
  policyNames: string[]
  userId: string | null
  expiresAt: string | null
  revoked: boolean
  lastUsedAt: string | null
  createdAt: string
}

function statusOf(k: AdminApiKey): { label: string; variant: 'success' | 'neutral' | 'warning' } {
  if (k.revoked) return { label: 'revoked', variant: 'neutral' }
  if (k.expiresAt && new Date(k.expiresAt) < new Date()) {
    return { label: 'expired', variant: 'warning' }
  }
  return { label: 'active', variant: 'success' }
}

export default function ApiKeysSection({ accessToken }: { accessToken: string }) {
  const [keys, setKeys] = useState<AdminApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<AdminApiKey | null>(null)
  const [revoking, setRevoking] = useState(false)

  const config = useMemo(
    () => ({ headers: { Authorization: `Bearer ${accessToken}` } }),
    [accessToken],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/api-keys', config)
      setKeys(res.data as AdminApiKey[])
    } catch {
      toast.error('Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => {
    load()
  }, [load])

  const revoke = async () => {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      await api.post(`/admin/api-keys/${revokeTarget.id}/revoke`, {}, config)
      toast.success('API key revoked')
      setRevokeTarget(null)
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to revoke API key')
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-muted)]">
          {loading ? 'Loading…' : `${keys.length} API key${keys.length === 1 ? '' : 's'}`}
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New key
        </button>
      </div>

      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(3)].map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="p-12 text-center">
            <KeyRound className="w-7 h-7 mx-auto text-[var(--text-faint)] mb-3" />
            <p className="text-sm font-medium text-[var(--text)]">No API keys yet</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Issue a long-lived key for a vertical (brain, inbox…). Resource
              servers verify keys via token introspection.
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-4 h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
            >
              <Plus className="w-3.5 h-3.5" />
              New key
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
                  <th className="px-3 py-2 font-medium">Key</th>
                  <th className="px-3 py-2 font-medium">Tenant</th>
                  <th className="px-3 py-2 font-medium">Audience</th>
                  <th className="px-3 py-2 font-medium">Scopes</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Last used</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const status = statusOf(k)
                  return (
                    <tr
                      key={k.id}
                      className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-overlay)]/60 transition-colors"
                    >
                      <td className="px-3 py-2.5 min-w-0">
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-[var(--text)] truncate">
                            {k.name}
                          </div>
                          <div className="flex items-center gap-1 min-w-0 group">
                            <span className="text-[11px] text-[var(--text-faint)] font-mono truncate">
                              {k.prefix}…
                            </span>
                            <CopyButton
                              value={k.id}
                              what="Key ID"
                              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] font-mono text-[var(--text-muted)] whitespace-nowrap">
                        {k.companyId}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Badge variant="accent">{k.audience}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <Badge key={s} variant="mono" mono>
                              {s}
                            </Badge>
                          ))}
                          {(k.policyNames ?? []).map((p) => (
                            <Badge key={`p:${p}`} variant="neutral" mono>
                              {p}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                        {k.lastUsedAt ? formatRelative(k.lastUsedAt) : 'never'}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                        {formatRelative(k.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {!k.revoked && (
                          <button
                            type="button"
                            title="Revoke key"
                            aria-label="Revoke key"
                            onClick={() => setRevokeTarget(k)}
                            className="p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[color:var(--danger)] transition-colors"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateKeyPanel
        open={creating}
        onClose={() => setCreating(false)}
        config={config}
        onCreated={(rawKey) => {
          setCreating(false)
          setFreshKey(rawKey)
          load()
        }}
      />

      <NewKeyDialog rawKey={freshKey} onClose={() => setFreshKey(null)} />

      <ConfirmDialog
        open={!!revokeTarget}
        intent="danger"
        title="Revoke this API key?"
        description={
          <span>
            Every request authenticating with{' '}
            <code className="font-mono text-[var(--text)]">
              {revokeTarget?.prefix}…
            </code>{' '}
            will be rejected on the next introspection. This cannot be undone.
          </span>
        }
        confirmLabel={revoking ? 'Revoking…' : 'Revoke key'}
        onConfirm={revoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  )
}
