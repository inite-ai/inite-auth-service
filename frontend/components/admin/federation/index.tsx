'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Globe, Code2, KeyRound, Plug, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Badge } from '@/components/ui'
import { FederationProviderSummary } from './types'
import EditProviderPanel from './edit-panel'

interface FederationSectionProps {
  accessToken: string
}

const PROVIDER_ICON: Record<string, typeof Globe> = {
  google: Globe,
  github: Code2,
  oidc: KeyRound,
}

function SourceBadge({ source }: { source: 'db' | 'env' | 'unset' }) {
  if (source === 'db') return <Badge variant="accent">DB</Badge>
  if (source === 'env') return <Badge variant="warning">env</Badge>
  return <Badge variant="neutral">not set</Badge>
}

export default function FederationSection({ accessToken }: FederationSectionProps) {
  const [providers, setProviders] = useState<FederationProviderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<FederationProviderSummary | null>(null)
  const [busySlug, setBusySlug] = useState<string | null>(null)

  const config = useMemo(
    () => ({ headers: { Authorization: `Bearer ${accessToken}` } }),
    [accessToken],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/federation', config)
      setProviders(res.data as FederationProviderSummary[])
    } catch {
      toast.error('Failed to load federation providers')
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => {
    load()
  }, [load])

  const toggle = async (p: FederationProviderSummary) => {
    setBusySlug(p.slug)
    try {
      await api.post(
        `/admin/federation/${p.slug}/${p.enabled ? 'disable' : 'enable'}`,
        {},
        config,
      )
      toast.success(p.enabled ? 'Provider disabled' : 'Provider enabled')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to update provider')
    } finally {
      setBusySlug(null)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-muted)]">
        Social & OIDC login connectors. Values from environment variables are
        shown read-only; save here to override them in the database (secrets
        encrypted at rest).
      </p>

      <div className="space-y-2">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg animate-pulse"
            />
          ))
        ) : (
          providers.map((p) => {
            const Icon = PROVIDER_ICON[p.slug] ?? Plug
            return (
              <div
                key={p.slug}
                className="flex items-center gap-3 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-4 py-3"
              >
                <span className="w-9 h-9 rounded-md bg-[var(--bg-overlay)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--text)]">
                      {p.displayName}
                    </span>
                    {p.enabled ? (
                      <Badge variant="success">Enabled</Badge>
                    ) : (
                      <Badge variant="neutral">Disabled</Badge>
                    )}
                    <SourceBadge source={p.source} />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(p.callbackUrl)
                      toast.success('Callback URL copied')
                    }}
                    className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-mono text-[var(--text-faint)] hover:text-[var(--text)] transition-colors max-w-full"
                    title="Copy callback URL"
                  >
                    <Copy className="w-3 h-3 shrink-0" />
                    <span className="truncate">{p.callbackUrl}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => toggle(p)}
                  disabled={busySlug === p.slug || p.source === 'unset'}
                  title={
                    p.source === 'unset'
                      ? 'Configure the provider before enabling'
                      : p.enabled
                        ? 'Disable'
                        : 'Enable'
                  }
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-40 ${
                    p.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--bg-overlay)]'
                  }`}
                  aria-label="Toggle provider"
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      p.enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  className="h-8 px-3 text-xs rounded-md border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--bg-overlay)] shrink-0"
                >
                  Configure
                </button>
              </div>
            )
          })
        )}
      </div>

      <EditProviderPanel
        provider={editing}
        onClose={() => setEditing(null)}
        config={config}
        onSaved={() => {
          setEditing(null)
          load()
        }}
      />
    </div>
  )
}
