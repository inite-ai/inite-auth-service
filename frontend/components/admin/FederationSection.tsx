'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Globe,
  Code2,
  KeyRound,
  Plug,
  Copy,
  Loader2,
  Check,
  X,
  Eye,
  EyeOff,
  PlugZap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Sheet, Badge } from '@/components/ui'

interface FederationProviderSummary {
  slug: string
  displayName: string
  enabled: boolean
  source: 'db' | 'env' | 'unset'
  clientId: string
  hasSecret: boolean
  scopes: string[]
  issuer: string | null
  callbackUrl: string
  requiresIssuer: boolean
}

interface FederationSectionProps {
  accessToken: string
}

const PROVIDER_ICON: Record<string, typeof Globe> = {
  google: Globe,
  github: Code2,
  oidc: KeyRound,
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

                {/* Enable/disable toggle */}
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

function SourceBadge({ source }: { source: 'db' | 'env' | 'unset' }) {
  if (source === 'db') return <Badge variant="accent">DB</Badge>
  if (source === 'env') return <Badge variant="warning">env</Badge>
  return <Badge variant="neutral">not set</Badge>
}

// ===== Edit provider panel =====

function EditProviderPanel({
  provider,
  onClose,
  config,
  onSaved,
}: {
  provider: FederationProviderSummary | null
  onClose: () => void
  config: any
  onSaved: () => void
}) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [scopes, setScopes] = useState<string[]>([])
  const [issuer, setIssuer] = useState('')
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (provider) {
      setClientId(provider.clientId)
      setClientSecret('')
      setShowSecret(false)
      setScopes(provider.scopes)
      setIssuer(provider.issuer ?? '')
      setTestResult(null)
    }
  }, [provider])

  if (!provider) {
    return (
      <Sheet open={false} onClose={onClose} title="">
        <></>
      </Sheet>
    )
  }

  const envManaged = provider.source === 'env'

  const save = async () => {
    if (!clientId.trim()) {
      toast.error('Client ID is required')
      return
    }
    if (provider.requiresIssuer && !issuer.trim()) {
      toast.error('The OIDC connector requires an issuer URL')
      return
    }
    setSaving(true)
    try {
      await api.put(
        `/admin/federation/${provider.slug}`,
        {
          clientId: clientId.trim(),
          ...(clientSecret ? { clientSecret } : {}),
          scopes,
          ...(provider.requiresIssuer ? { issuer: issuer.trim() } : {}),
        },
        config,
      )
      toast.success('Provider saved')
      onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to save provider')
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.post(`/admin/federation/${provider.slug}/test`, {}, config)
      setTestResult(res.data as { ok: boolean; detail: string })
    } catch (err: any) {
      setTestResult({ ok: false, detail: err.response?.data?.message ?? 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Sheet
      open
      onClose={() => !saving && onClose()}
      title={`Configure ${provider.displayName}`}
      subtitle={provider.slug}
      width="md"
      footer={
        <div className="flex justify-between items-center gap-2">
          <button
            type="button"
            onClick={test}
            disabled={testing}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs rounded-md text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--bg-overlay)] disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PlugZap className="w-3.5 h-3.5" />
            )}
            Test connection
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-8 px-3 text-xs rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Save to DB
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {envManaged && (
          <div className="text-[11px] text-[color:var(--warning)] bg-[color:var(--warning)]/10 border border-[color:var(--warning)]/30 rounded-md px-2.5 py-2">
            Currently managed via environment variables. Saving here writes a
            database override that takes precedence over the env config.
          </div>
        )}

        <div>
          <FieldLabel label="Callback URL" hint="register this at the provider" />
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--text)] bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 break-all">
            {provider.callbackUrl}
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(provider.callbackUrl)
                toast.success('Copied')
              }}
              className="ml-auto text-[var(--text-faint)] hover:text-[var(--text)] shrink-0"
              aria-label="Copy callback URL"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div>
          <FieldLabel label="Client ID" />
          <TextField mono value={clientId} onChange={setClientId} placeholder="…apps.googleusercontent.com" />
        </div>

        <div>
          <FieldLabel
            label="Client secret"
            hint={provider.hasSecret ? 'stored · leave blank to keep' : 'write-only'}
          />
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={provider.hasSecret ? '•••••••• (unchanged)' : 'client secret'}
              className="w-full h-9 pl-3 pr-9 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm font-mono text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40"
            />
            <button
              type="button"
              onClick={() => setShowSecret((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)] hover:text-[var(--text)]"
              aria-label={showSecret ? 'Hide' : 'Show'}
            >
              {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {provider.requiresIssuer && (
          <div>
            <FieldLabel label="Issuer" hint="https · OIDC discovery base" />
            <TextField mono value={issuer} onChange={setIssuer} placeholder="https://idp.example.com" />
          </div>
        )}

        <div>
          <FieldLabel label="Scopes" />
          <ChipInput values={scopes} onChange={setScopes} placeholder="openid, email, profile" />
        </div>

        {testResult && (
          <div
            className={`text-xs rounded-md px-2.5 py-2 border ${
              testResult.ok
                ? 'text-[color:var(--success)] bg-[color:var(--success)]/10 border-[color:var(--success)]/30'
                : 'text-[color:var(--danger)] bg-[color:var(--danger)]/10 border-[color:var(--danger)]/30'
            }`}
          >
            {testResult.ok ? '✓ ' : '✕ '}
            {testResult.detail}
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ===== local form bits =====

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
      {label}
      {hint && (
        <span className="ml-2 text-[var(--text-faint)] font-normal">{hint}</span>
      )}
    </label>
  )
}

function TextField({
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full h-9 px-3 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 ${
        mono ? 'font-mono' : ''
      }`}
    />
  )
}

function ChipInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const [input, setInput] = useState('')
  const add = (raw: string) => {
    const v = raw.trim()
    if (!v || values.includes(v)) return
    onChange([...values, v])
  }
  return (
    <div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {values.map((v) => (
            <Badge key={v} variant="accent" mono>
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                className="hover:text-[var(--text)] -mr-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(input)
              setInput('')
            }
          }}
          placeholder={placeholder}
          className="flex-1 h-8 px-2.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 font-mono"
        />
        <button
          type="button"
          onClick={() => {
            add(input)
            setInput('')
          }}
          className="h-8 px-2.5 text-xs rounded-md bg-[var(--bg-overlay)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  )
}
