'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { authStorage } from '@/lib/authStorage'
import { buildConsentUrl, isOAuthFlow, OAuthParams } from '@/lib/oauthHelpers'

export type AuthMethod = 'passkey' | 'magic-link' | 'password' | 'otp' | 'wallet'
export type AuthVariant = 'login' | 'register'

export interface AuthPageProps {
  variant: AuthVariant
}

export function useOAuthParams(): OAuthParams {
  const searchParams = useSearchParams()
  return useMemo(
    () => ({
      clientId: searchParams.get('client_id'),
      redirectUri: searchParams.get('redirect_uri'),
      scope: searchParams.get('scope'),
      state: searchParams.get('state'),
      codeChallenge: searchParams.get('code_challenge'),
      codeChallengeMethod: searchParams.get('code_challenge_method'),
      acrValues: searchParams.get('acr_values'),
      prompt: searchParams.get('prompt'),
      resource: searchParams.get('resource'),
    }),
    [searchParams],
  )
}

export function useAuthGate(
  variant: AuthVariant,
  oauthParams: OAuthParams,
  stepUp: boolean,
) {
  const router = useRouter()
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    let cancelled = false

    const checkAuth = async () => {
      try {
        // Step-up: the RP asked for a higher assurance than the current
        // session holds. Don't silently continue on the existing (too-weak)
        // session — force the user to pick a stronger factor.
        if (stepUp) {
          if (!cancelled) setCheckingAuth(false)
          return
        }
        if (variant === 'register') {
          const token = authStorage.getToken()
          if (token) {
            if (isOAuthFlow(oauthParams)) {
              window.location.href = buildConsentUrl(oauthParams)
            } else {
              router.push('/account')
            }
            return
          }
          if (!cancelled) setCheckingAuth(false)
          return
        }

        let token = authStorage.getValidToken()
        if (!token) {
          try {
            const response = await fetch('/v1/auth/session/me', {
              credentials: 'include',
            })
            const data = await response.json()
            if (data.authenticated && data.access_token) {
              authStorage.save({
                accessToken: data.access_token,
                userId: data.user?.id,
              })
              token = data.access_token
            }
          } catch {
            /* ignore */
          }
        }

        if (token) {
          if (isOAuthFlow(oauthParams)) {
            window.location.href = buildConsentUrl(oauthParams)
          } else {
            router.push('/account')
          }
        } else if (!cancelled) {
          setCheckingAuth(false)
        }
      } catch {
        if (!cancelled) setCheckingAuth(false)
      }
    }

    checkAuth()
    return () => {
      cancelled = true
    }
  }, [variant, oauthParams, router, stepUp])

  return checkingAuth
}

export function buildTargetHref(
  target: '/login' | '/register',
  {
    clientId,
    redirectUri,
    scope,
    state,
    codeChallenge,
    codeChallengeMethod,
  }: OAuthParams,
) {
  if (!clientId) return target
  const params = new URLSearchParams()
  params.set('client_id', clientId)
  if (redirectUri) params.set('redirect_uri', redirectUri)
  if (scope) params.set('scope', scope)
  if (state) params.set('state', state)
  if (codeChallenge) params.set('code_challenge', codeChallenge)
  if (codeChallengeMethod) params.set('code_challenge_method', codeChallengeMethod)
  return `${target}?${params.toString()}`
}

export function AuthPageFallback() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <Loader2 className="w-5 h-5 text-[var(--text-faint)] animate-spin" />
    </div>
  )
}
