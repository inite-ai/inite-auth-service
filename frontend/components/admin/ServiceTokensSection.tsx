'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Server,
  Copy,
  Check,
  Eye,
  EyeOff,
  Loader2,
  KeyRound,
  Code2,
  Plus,
  Inbox,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { SkeletonRow } from '@/components/ui'

interface ServiceClient {
  id: string
  clientId: string
  name: string
  companyId?: string | null
  allowedScopes: string[]
  allowedAudiences?: string[]
  allowedGrants: string[]
  active: boolean
  hasCredentialsGrant: boolean
}

interface Props {
  accessToken: string
  /** Callback to switch parent to the OAuth Clients tab for creation. */
  onCreateNew?: () => void
}

function decodeJwtSegment(seg: string | undefined): any | null {
  if (!seg) return null
  try {
    const norm = seg.replace(/-/g, '+').replace(/_/g, '/')
    const padded = norm.padEnd(norm.length + ((4 - (norm.length % 4)) % 4), '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

/**
 * Service Tokens admin view. Lists every OAuth client that supports
 * the client_credentials grant — these are the M2M callers (backend
 * services minting tokens to talk to other backends).
 *
 * The "Mint" panel keeps the heavy work (decoding JWT, showing scope,
 * curl) one click away without leaving the page. Operators don't have
 * to fish through the broader OAuth Clients view.
 */
export function ServiceTokensSection({ accessToken, onCreateNew }: Props) {
  const [clients, setClients] = useState<ServiceClient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mintTarget, setMintTarget] = useState<ServiceClient | null>(null)
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [scope, setScope] = useState('')
  const [audience, setAudience] = useState('')
  const [minting, setMinting] = useState(false)
  const [mintError, setMintError] = useState<string | null>(null)
  const [mintResult, setMintResult] = useState<{
    rawJwt: string
    header: any
    payload: any
    scope: string
    expiresIn: number
  } | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data } = await api.get('/admin/oauth-clients', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (cancelled) return
        const list = (Array.isArray(data) ? data : data?.clients ?? []) as any[]
        const m2m: ServiceClient[] = list
          .map((c) => ({
            ...c,
            hasCredentialsGrant:
              Array.isArray(c.allowedGrants) &&
              c.allowedGrants.includes('client_credentials'),
          }))
          .filter((c) => c.hasCredentialsGrant)
        setClients(m2m)
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.response?.data?.message ?? 'Failed to load service clients')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1500)
    })
  }

  const handleMint = async () => {
    if (!mintTarget || !secret) {
      toast.error('Paste the client_secret first')
      return
    }
    setMinting(true)
    setMintError(null)
    setMintResult(null)
    try {
      const body: Record<string, string> = {
        grant_type: 'client_credentials',
        client_id: mintTarget.clientId,
        client_secret: secret,
      }
      if (scope.trim()) body.scope = scope.trim()
      if (audience.trim()) body.audience = audience.trim()

      const res = await api.post('/oauth/token', body)
      const jwt = res.data.access_token as string
      const [h, p] = jwt.split('.')
      setMintResult({
        rawJwt: jwt,
        header: decodeJwtSegment(h),
        payload: decodeJwtSegment(p),
        expiresIn: res.data.expires_in,
        scope: res.data.scope ?? '',
      })
    } catch (e: any) {
      setMintError(
        e?.response?.data?.message ?? e?.response?.data?.error ?? 'Token request failed',
      )
    } finally {
      setMinting(false)
    }
  }

  const curlSnippet = useMemo(() => {
    if (!mintTarget) return ''
    const host = typeof window !== 'undefined' ? window.location.origin : 'https://auth.inite.ai'
    const scopeLine = scope ? `\n  -d 'scope=${scope}' \\` : ''
    const audLine = audience ? `\n  -d 'audience=${audience}' \\` : ''
    return `curl -X POST ${host}/v1/oauth/token \\
  -H 'Content-Type: application/x-www-form-urlencoded' \\
  -d 'grant_type=client_credentials' \\
  -d 'client_id=${mintTarget.clientId}' \\
  -d 'client_secret=<your-secret>' \\${scopeLine}${audLine}`
  }, [mintTarget, scope, audience])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--text)] tracking-tight">
            Service Tokens
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            OAuth clients that mint machine-to-machine JWTs via
            <code className="ml-1 px-1 py-0.5 text-xs rounded bg-[var(--bg-overlay)] border border-[var(--border)] font-mono">
              client_credentials
            </code>
            .
          </p>
        </div>
        {onCreateNew && (
          <button
            type="button"
            onClick={onCreateNew}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            <Plus className="w-3.5 h-3.5" />
            New service client
          </button>
        )}
      </div>

      {loading && (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-4 space-y-2">
          {[...Array(3)].map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="bg-[color:var(--danger)]/5 border border-[color:var(--danger)]/30 rounded-lg p-4 text-sm text-[color:var(--danger)]">
          {error}
        </div>
      )}

      {!loading && !error && clients.length === 0 && (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-10 text-center">
          <Inbox className="w-8 h-8 mx-auto text-[var(--text-faint)] mb-3" />
          <p className="text-sm text-[var(--text)] font-medium">No service clients yet</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Create an OAuth client with the <code className="px-1 py-0.5 rounded bg-[var(--bg-overlay)] border border-[var(--border)] font-mono">client_credentials</code> grant to mint M2M tokens.
          </p>
          {onCreateNew && (
            <button
              type="button"
              onClick={onCreateNew}
              className="mt-4 h-8 px-3 inline-flex items-center gap-1.5 text-xs rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
            >
              <Plus className="w-3.5 h-3.5" />
              Create one
            </button>
          )}
        </div>
      )}

      {!loading && !error && clients.length > 0 && (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg overflow-hidden">
          {clients.map((c, i) => {
            const open = mintTarget?.clientId === c.clientId
            return (
              <div
                key={c.clientId}
                className={i > 0 ? 'border-t border-[var(--border)]' : ''}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMintTarget(open ? null : c)
                    setSecret('')
                    setShowSecret(false)
                    setScope('')
                    setAudience(c.allowedAudiences?.[0] ?? '')
                    setMintError(null)
                    setMintResult(null)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-overlay)] transition-colors"
                >
                  <span className="w-8 h-8 rounded-md bg-[var(--bg-overlay)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                    <Server className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text)]">
                        {c.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-faint)] text-[var(--accent)] border border-[color:var(--accent)]/30">
                        M2M
                      </span>
                      {!c.active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-overlay)] text-[var(--text-faint)] border border-[var(--border)]">
                          inactive
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-[var(--text-muted)] mt-0.5 font-mono truncate">
                      {c.clientId}
                    </span>
                  </span>
                  <KeyRound className={`w-4 h-4 shrink-0 ${open ? 'text-[var(--accent)]' : 'text-[var(--text-faint)]'}`} />
                </button>

                {open && (
                  <div className="px-4 pb-4 pt-2 border-t border-[var(--border)] bg-[var(--bg)]/40 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-[var(--text-muted)] mb-1.5 block">
                        Client secret
                      </label>
                      <div className="relative">
                        <input
                          type={showSecret ? 'text' : 'password'}
                          value={secret}
                          onChange={(e) => setSecret(e.target.value)}
                          placeholder="Paste the secret from creation or rotation"
                          className="w-full h-9 px-3 pr-9 text-sm bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md focus:outline-none focus:border-[var(--accent)] font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecret((v) => !v)}
                          aria-label={showSecret ? 'Hide' : 'Show'}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-faint)] hover:text-[var(--text-muted)]"
                        >
                          {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-[var(--text-muted)] mb-1.5 block">
                          Scope (optional)
                        </label>
                        <input
                          value={scope}
                          onChange={(e) => setScope(e.target.value)}
                          placeholder={c.allowedScopes.join(' ') || 'all allowed'}
                          className="w-full h-9 px-3 text-sm bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md focus:outline-none focus:border-[var(--accent)] font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-[var(--text-muted)] mb-1.5 block">
                          Audience (optional)
                        </label>
                        <input
                          value={audience}
                          onChange={(e) => setAudience(e.target.value)}
                          placeholder={c.allowedAudiences?.[0] ?? c.clientId}
                          className="w-full h-9 px-3 text-sm bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md focus:outline-none focus:border-[var(--accent)] font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleMint}
                        disabled={minting || !secret}
                        className="h-8 px-3 inline-flex items-center gap-1.5 text-xs rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                      >
                        {minting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <KeyRound className="w-3.5 h-3.5" />
                        )}
                        Mint test token
                      </button>
                      <button
                        type="button"
                        onClick={() => copy('curl-' + c.clientId, curlSnippet)}
                        className="h-8 px-3 inline-flex items-center gap-1.5 text-xs rounded-md bg-transparent border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--bg-overlay)]"
                      >
                        {copiedKey === 'curl-' + c.clientId ? (
                          <Check className="w-3.5 h-3.5 text-[color:var(--success)]" />
                        ) : (
                          <Code2 className="w-3.5 h-3.5" />
                        )}
                        Copy curl
                      </button>
                    </div>

                    {mintError && (
                      <div className="text-xs text-[color:var(--danger)] bg-[color:var(--danger)]/5 border border-[color:var(--danger)]/30 rounded-md px-3 py-2">
                        {mintError}
                      </div>
                    )}

                    {mintResult && (
                      <div className="space-y-2">
                        <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md">
                          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
                            <span className="text-xs font-medium text-[var(--text-muted)]">
                              JWT · expires in {mintResult.expiresIn}s · scope:{' '}
                              <span className="font-mono text-[var(--text)]">
                                {mintResult.scope || '(none)'}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => copy('jwt-' + c.clientId, mintResult.rawJwt)}
                              className="text-[var(--text-muted)] hover:text-[var(--text)]"
                              aria-label="Copy JWT"
                            >
                              {copiedKey === 'jwt-' + c.clientId ? (
                                <Check className="w-3.5 h-3.5 text-[color:var(--success)]" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <pre className="px-3 py-2 text-[11px] font-mono text-[var(--text)] break-all whitespace-pre-wrap">
                            {mintResult.rawJwt}
                          </pre>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-2">
                          <DecodedPanel title="Header" data={mintResult.header} />
                          <DecodedPanel title="Payload" data={mintResult.payload} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DecodedPanel({ title, data }: { title: string; data: any }) {
  return (
    <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md">
      <div className="px-3 py-2 border-b border-[var(--border)] text-xs font-medium text-[var(--text-muted)]">
        {title}
      </div>
      <pre className="px-3 py-2 text-[11px] font-mono text-[var(--text)] whitespace-pre-wrap break-all">
        {data ? JSON.stringify(data, null, 2) : '(failed to decode)'}
      </pre>
    </div>
  )
}
