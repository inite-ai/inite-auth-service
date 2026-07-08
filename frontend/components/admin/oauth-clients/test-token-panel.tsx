'use client'

import { useState, useEffect } from 'react'
import {
  RefreshCw,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  PlayCircle,
  Terminal,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Sheet } from '@/components/ui'
import { OAuthClient, decodeJwtSegment } from './types'
import { FieldLabel, TextField } from './shared'

export function TestTokenPanel({
  client,
  onClose,
  config,
}: {
  client: OAuthClient | null
  onClose: () => void
  config: any
}) {
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [scope, setScope] = useState('')
  const [audience, setAudience] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    rawJwt: string
    header: any
    payload: any
    expiresIn: number
    scope: string
  } | null>(null)

  useEffect(() => {
    if (!client) {
      setSecret('')
      setShowSecret(false)
      setScope('')
      setAudience('')
      setError(null)
      setResult(null)
      return
    }
    setScope((client.allowedScopes ?? []).join(' '))
    setAudience((client.allowedAudiences ?? [])[0] ?? '')
  }, [client])

  if (!client) {
    return (
      <Sheet open={false} onClose={onClose} title="">
        <></>
      </Sheet>
    )
  }

  const mint = async () => {
    if (!secret) {
      toast.error('Paste the client_secret first')
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const body: Record<string, string> = {
        grant_type: 'client_credentials',
        client_id: client.clientId,
        client_secret: secret,
      }
      if (scope.trim()) body.scope = scope.trim()
      if (audience.trim()) body.audience = audience.trim()
      const res = await api.post('/oauth/token', body)
      const jwt = res.data.access_token as string
      const [h, p] = jwt.split('.')
      setResult({
        rawJwt: jwt,
        header: decodeJwtSegment(h),
        payload: decodeJwtSegment(p),
        expiresIn: res.data.expires_in,
        scope: res.data.scope ?? '',
      })
    } catch (err: any) {
      setError(
        err?.response?.data?.message ??
          err?.response?.data?.error ??
          err?.message ??
          'Token request failed',
      )
    } finally {
      setBusy(false)
    }
  }

  const host =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://auth.inite.ai'
  const scopeLine = scope ? `\n  -d 'scope=${scope}' \\` : ''
  const audLine = audience ? `\n  -d 'audience=${audience}' \\` : ''
  const curlSnippet = `curl -X POST ${host}/v1/oauth/token \\
  -H 'Content-Type: application/x-www-form-urlencoded' \\
  -d 'grant_type=client_credentials' \\
  -d 'client_id=${client.clientId}' \\
  -d 'client_secret=<your-secret>' \\${scopeLine}${audLine}`

  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title="Test M2M token"
      subtitle={client.clientId}
      width="md"
    >
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <FieldLabel label="Client secret" />
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await api.post(
                    `/admin/oauth-clients/${client.clientId}/rotate-secret`,
                    { force: false, graceWindowSeconds: 3600 },
                    config,
                  )
                  setSecret(res.data.clientSecret)
                  setShowSecret(true)
                  toast.success(
                    'Fresh secret issued (1h grace on the previous one)',
                  )
                } catch {
                  toast.error('Rotation failed')
                }
              }}
              className="text-[11px] text-[color:var(--warning)] hover:opacity-80 inline-flex items-center gap-1 -mt-1"
            >
              <RefreshCw className="w-3 h-3" />
              Issue fresh
            </button>
          </div>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="paste secret or click 'Issue fresh'"
              className="w-full h-9 px-3 pr-9 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm text-[var(--text)] font-mono placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40"
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              aria-label={showSecret ? 'Hide' : 'Show'}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-faint)] hover:text-[var(--text-muted)]"
            >
              {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel label="Scope" hint="optional" />
            <TextField
              mono
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="brain:read brain:write"
            />
          </div>
          <div>
            <FieldLabel label="Audience" hint="optional" />
            <TextField
              mono
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="brain"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={mint}
          disabled={busy || !secret}
          className="w-full h-9 inline-flex items-center justify-center gap-1.5 text-sm font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <PlayCircle className="w-4 h-4" />
          )}
          Mint test token
        </button>

        {error && (
          <div className="text-xs text-[color:var(--danger)] bg-[color:var(--danger)]/5 border border-[color:var(--danger)]/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="bg-[color:var(--success)]/5 border border-[color:var(--success)]/30 rounded-md px-3 py-2 text-xs text-[color:var(--success)] flex items-center gap-2">
              <Check className="w-3.5 h-3.5" />
              Token minted · expires in {result.expiresIn}s
            </div>

            <CodeBlock
              label="access_token"
              code={result.rawJwt}
              maxHeight="6rem"
            />

            {result.payload && (
              <CodeBlock
                label="decoded payload"
                code={JSON.stringify(result.payload, null, 2)}
              />
            )}
            {result.payload?.cnf?.jkt && (
              <p className="text-[11px] text-[var(--accent)]">
                ✓ DPoP-bound (cnf.jkt present)
              </p>
            )}
          </div>
        )}

        <div className="pt-3 border-t border-[var(--border)]">
          <CodeBlock
            label={
              <span className="inline-flex items-center gap-1">
                <Terminal className="w-3 h-3" />
                curl snippet
              </span>
            }
            code={curlSnippet}
          />
        </div>
      </div>
    </Sheet>
  )
}

function CodeBlock({
  label,
  code,
  maxHeight,
}: {
  label: React.ReactNode
  code: string
  maxHeight?: string
}) {
  const copy = () => {
    navigator.clipboard.writeText(code)
    toast.success('Copied')
  }
  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border)]">
        <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="text-[var(--text-faint)] hover:text-[var(--text)]"
          aria-label="Copy"
        >
          <Copy className="w-3 h-3" />
        </button>
      </div>
      <pre
        className="px-2.5 py-2 text-[11px] font-mono text-[var(--text)] whitespace-pre-wrap break-all overflow-y-auto"
        style={maxHeight ? { maxHeight } : undefined}
      >
        {code}
      </pre>
    </div>
  )
}
