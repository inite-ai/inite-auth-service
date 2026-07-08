'use client'

import { useState, useEffect } from 'react'
import { Copy, Loader2, Check, Eye, EyeOff, PlugZap } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Sheet } from '@/components/ui'
import { FieldLabel, TextField, ChipInput } from '../form-controls'
import { FederationProviderSummary } from './types'

export default function EditProviderPanel({
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
