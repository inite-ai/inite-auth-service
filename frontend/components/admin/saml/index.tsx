'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ShieldCheck, Plus, Copy, Trash2, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Badge, SkeletonRow, ConfirmDialog } from '@/components/ui'
import { formatRelative } from '../form-controls'
import CreateSamlPanel from './create-panel'
import { SamlConnection } from './types'

function apiBase(): string {
  return (api.defaults.baseURL ?? '').replace(/\/$/, '')
}

function copy(value: string, label: string) {
  navigator.clipboard.writeText(value)
  toast.success(`${label} copied`)
}

export default function SamlSection({ accessToken }: { accessToken: string }) {
  const [rows, setRows] = useState<SamlConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<SamlConnection | null>(null)
  const [busy, setBusy] = useState(false)

  const config = useMemo(
    () => ({ headers: { Authorization: `Bearer ${accessToken}` } }),
    [accessToken],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/saml/connections', config)
      setRows(res.data as SamlConnection[])
    } catch {
      toast.error('Failed to load SAML connections')
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => { load() }, [load])

  const remove = async () => {
    if (!pendingDelete) return
    setBusy(true)
    try {
      await api.delete(`/admin/saml/connections/${pendingDelete.id}`, config)
      toast.success('Connection deleted')
      setPendingDelete(null)
      load()
    } catch {
      toast.error('Failed to delete connection')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-muted)] max-w-prose">
          Inbound enterprise SSO. Each connection validates SAML assertions from
          one IdP; the signing certificate is encrypted at rest. Requires the SAML
          feature to be enabled in Settings.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New connection
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 border border-dashed border-[var(--border)] rounded-lg">
          <span className="w-10 h-10 rounded-lg bg-[var(--bg-overlay)] border border-[var(--border)] flex items-center justify-center text-[var(--text-faint)] mb-3">
            <ShieldCheck className="w-5 h-5" />
          </span>
          <p className="text-sm text-[var(--text)]">No SAML connections yet</p>
          <p className="mt-1 text-xs text-[var(--text-muted)] max-w-xs">
            Add an enterprise IdP to let its users sign in via SAML SSO.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            <Plus className="w-3.5 h-3.5" />
            New connection
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => {
            const metadataUrl = `${apiBase()}/auth/saml/${c.slug}/metadata`
            const acsUrl = `${apiBase()}/auth/saml/${c.slug}/acs`
            return (
              <div
                key={c.id}
                className="flex items-start gap-3 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-4 py-3"
              >
                <span className="w-9 h-9 rounded-md bg-[var(--bg-overlay)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] shrink-0 mt-0.5">
                  <KeyRound className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[var(--text)]">{c.displayName}</span>
                    <Badge variant="mono" mono>{c.slug}</Badge>
                    {c.enabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="neutral">Disabled</Badge>}
                    <span className="text-[11px] text-[var(--text-faint)]">tenant {c.companyId}</span>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    <UrlRow label="SP metadata" value={metadataUrl} />
                    <UrlRow label="ACS URL" value={acsUrl} />
                    <div className="text-[11px] text-[var(--text-faint)] font-mono truncate">
                      IdP {c.idpEntityId}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPendingDelete(c)}
                    aria-label="Delete connection"
                    title="Delete connection"
                    className="p-1.5 text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[var(--bg-overlay)] rounded-md transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] text-[var(--text-faint)]">{formatRelative(c.createdAt)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <CreateSamlPanel
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => { setCreating(false); load() }}
        config={config}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete SAML connection?"
        description={`"${pendingDelete?.displayName}" will stop accepting assertions immediately. This cannot be undone.`}
        confirmLabel="Delete"
        intent="danger"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

function UrlRow({ label, value }: { label: string; value: string }) {
  return (
    <button
      type="button"
      onClick={() => copy(value, label)}
      title={`Copy ${label}`}
      className="group flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-faint)] hover:text-[var(--text)] transition-colors max-w-full"
    >
      <span className="shrink-0 text-[var(--text-muted)] not-italic font-sans">{label}</span>
      <Copy className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      <span className="truncate">{value}</span>
    </button>
  )
}
