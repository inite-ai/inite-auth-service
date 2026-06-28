'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { LogIn } from 'lucide-react'
import { OAuthParams } from '@/lib/oauthHelpers'

interface Provider {
  id: string
  displayName: string
}

interface SocialLoginProps {
  oauthParams: OAuthParams
}

// Human-readable copy for the redirect error codes the backend sets on the
// /login URL when a federated callback fails.
const ERROR_COPY: Record<string, string> = {
  email_conflict:
    'An account already exists for that email. Sign in with your existing method, then link this provider from account settings.',
  federation_failed: 'Social sign-in failed. Please try again.',
}

/**
 * Social login buttons. Fetches the providers the server has configured
 * (/v1/auth/oauth/providers) and links each to the start endpoint, forwarding
 * any in-flight OAuth-authorize params so the flow resumes after the round-trip.
 */
export default function SocialLogin({ oauthParams }: SocialLoginProps) {
  const [providers, setProviders] = useState<Provider[]>([])
  const searchParams = useSearchParams()
  const error = searchParams.get('federation_error')

  useEffect(() => {
    let cancelled = false
    fetch('/v1/auth/oauth/providers', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data?.providers)) {
          setProviders(data.providers)
        }
      })
      .catch(() => {
        /* federation not configured — render nothing */
      })
    return () => {
      cancelled = true
    }
  }, [])

  function startHref(providerId: string) {
    const params = new URLSearchParams()
    if (oauthParams.clientId) params.set('client_id', oauthParams.clientId)
    if (oauthParams.redirectUri) params.set('redirect_uri', oauthParams.redirectUri)
    if (oauthParams.scope) params.set('scope', oauthParams.scope)
    if (oauthParams.state) params.set('state', oauthParams.state)
    if (oauthParams.codeChallenge) params.set('code_challenge', oauthParams.codeChallenge)
    if (oauthParams.codeChallengeMethod)
      params.set('code_challenge_method', oauthParams.codeChallengeMethod)
    const qs = params.toString()
    return `/v1/auth/oauth/${providerId}/start${qs ? `?${qs}` : ''}`
  }

  if (providers.length === 0 && !error) return null

  return (
    <div className="mt-6">
      {error && (
        <p
          role="alert"
          className="mb-4 text-xs text-[color:var(--danger)] bg-[color:var(--danger)]/10 border border-[color:var(--danger)]/30 rounded-md px-3 py-2"
        >
          {ERROR_COPY[error] ?? ERROR_COPY.federation_failed}
        </p>
      )}

      {providers.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-xs text-[var(--text-faint)]">or continue with</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="space-y-2">
            {providers.map((p) => (
              <a
                key={p.id}
                href={startHref(p.id)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-overlay)] transition-colors"
              >
                <LogIn className="w-4 h-4 text-[var(--text-muted)]" />
                {p.displayName}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
