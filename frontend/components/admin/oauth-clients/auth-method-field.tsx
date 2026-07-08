'use client'

import { OAuthClient } from './types'
import { FieldLabel, TextField } from './shared'

// ===== token-endpoint auth method (RFC 7591 private_key_jwt) =====

export type AuthMethod = 'client_secret_post' | 'private_key_jwt' | 'none'

export interface AuthMethodValue {
  method: AuthMethod
  jwksMode: 'url' | 'paste'
  jwksUri: string
  jwksText: string
}

export const AUTH_METHODS: Array<{ id: AuthMethod; label: string; hint: string }> = [
  { id: 'client_secret_post', label: 'Client secret', hint: 'Confidential client authenticates with a shared secret.' },
  { id: 'private_key_jwt', label: 'private_key_jwt', hint: 'Client signs a JWT assertion with its private key; we hold only the public JWKS.' },
  { id: 'none', label: 'Public (none)', hint: 'No client authentication — public client, must use PKCE.' },
]

export function defaultAuthValue(): AuthMethodValue {
  return { method: 'client_secret_post', jwksMode: 'url', jwksUri: '', jwksText: '' }
}

export function authValueFromClient(client: OAuthClient): AuthMethodValue {
  const method: AuthMethod =
    (client.tokenEndpointAuthMethod as AuthMethod | null) ??
    (client.isPublic ? 'none' : 'client_secret_post')
  return {
    method,
    jwksMode: client.jwksUri ? 'url' : 'paste',
    jwksUri: client.jwksUri ?? '',
    jwksText: client.jwks ? JSON.stringify(client.jwks, null, 2) : '',
  }
}

/** Validate + reduce the auth-method fields into the create/update payload. */
export function buildAuthPayload(
  v: AuthMethodValue,
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  if (v.method !== 'private_key_jwt') {
    return { ok: true, payload: { tokenEndpointAuthMethod: v.method } }
  }
  if (v.jwksMode === 'url') {
    const uri = v.jwksUri.trim()
    if (!/^https:\/\//.test(uri)) return { ok: false, error: 'JWKS URL must be an https URL' }
    return { ok: true, payload: { tokenEndpointAuthMethod: 'private_key_jwt', jwksUri: uri } }
  }
  let parsed: any
  try {
    parsed = JSON.parse(v.jwksText)
  } catch {
    return { ok: false, error: 'JWK Set is not valid JSON' }
  }
  const keys = parsed?.keys
  if (!Array.isArray(keys) || keys.length === 0) {
    return { ok: false, error: 'JWK Set must have a non-empty "keys" array' }
  }
  if (keys.some((k: any) => k && (k.d !== undefined || k.kty === 'oct'))) {
    return { ok: false, error: 'That looks like a private key — paste only public keys (no "d"/oct).' }
  }
  return { ok: true, payload: { tokenEndpointAuthMethod: 'private_key_jwt', jwks: parsed } }
}

export function AuthMethodField({
  value,
  onChange,
}: {
  value: AuthMethodValue
  onChange: (next: AuthMethodValue) => void
}) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3 space-y-3">
      <FieldLabel label="Token-endpoint auth method" />
      <div className="inline-flex flex-wrap p-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md">
        {AUTH_METHODS.map((m) => {
          const active = value.method === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange({ ...value, method: m.id })}
              className={`h-7 px-2.5 text-xs rounded transition-colors ${
                active
                  ? 'bg-[var(--bg-overlay)] text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {m.label}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">
        {AUTH_METHODS.find((m) => m.id === value.method)?.hint}
      </p>

      {value.method === 'none' && (
        <div className="text-[11px] text-[color:var(--warning)] bg-[color:var(--warning)]/10 border border-[color:var(--warning)]/30 rounded-md px-2.5 py-1.5">
          Public client — no secret is used. Only register this for apps that
          cannot keep a secret (SPA/native) and always use PKCE.
        </div>
      )}

      {value.method === 'private_key_jwt' && (
        <div className="space-y-2">
          <div className="inline-flex p-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md">
            {(['url', 'paste'] as const).map((mode) => {
              const active = value.jwksMode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChange({ ...value, jwksMode: mode })}
                  className={`h-7 px-2.5 text-xs rounded transition-colors ${
                    active
                      ? 'bg-[var(--bg-overlay)] text-[var(--text)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {mode === 'url' ? 'JWKS URL' : 'Paste JWK Set'}
                </button>
              )
            })}
          </div>
          {value.jwksMode === 'url' ? (
            <TextField
              mono
              value={value.jwksUri}
              onChange={(e) => onChange({ ...value, jwksUri: e.target.value })}
              placeholder="https://client.example.com/.well-known/jwks.json"
            />
          ) : (
            <textarea
              value={value.jwksText}
              onChange={(e) => onChange({ ...value, jwksText: e.target.value })}
              placeholder='{ "keys": [ { "kty": "RSA", "n": "…", "e": "AQAB", "use": "sig" } ] }'
              rows={6}
              className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-xs font-mono text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40"
            />
          )}
          <p className="text-[11px] text-[var(--text-faint)]">
            Only public keys are accepted — a JWK with a private component
            (<code className="font-mono">d</code> / <code className="font-mono">oct</code>) is rejected.
          </p>
        </div>
      )}
    </div>
  )
}
