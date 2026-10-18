'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { authStorage } from '@/lib/authStorage'
import {
  buildConsentUrl,
  buildPassthroughHref,
  extractOAuthParams,
  isOAuthFlow,
  OAuthParams,
} from '@/lib/oauthHelpers'

export type AuthMethod = 'passkey' | 'magic-link' | 'password' | 'otp' | 'wallet'
export type AuthVariant = 'login' | 'register'

export interface AuthPageProps {
  variant: AuthVariant
}

export function useOAuthParams(): OAuthParams {
  const searchParams = useSearchParams()
  return useMemo(
    () => ({ ...extractOAuthParams(searchParams), prompt: searchParams.get('prompt') }),
    [searchParams],
  )
}

/**
 * `account` on the login URL — /authorize's answer to "which account?"
 * (src/oauth/account-choice.ts): `login` re-authenticate, `select` ask.
 */
export type AccountMode = 'login' | 'select' | null

export function readAccountMode(value: string | null): AccountMode {
  return value === 'login' || value === 'select' ? value : null
}

/** The address an access token was issued for, if it says. */
function tokenEmail(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { email?: unknown }
    return typeof payload.email === 'string' ? payload.email : null
  } catch {
    return null
  }
}

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export interface AuthGate {
  checkingAuth: boolean
  /**
   * Set when a session exists but this flow must not silently continue on
   * it: the screen shows who is signed in and lets the person choose.
   */
  signedInAs: { email: string | null } | null
}

/**
 * What the auth screen does with a session it finds.
 *
 * Outside an OAuth flow, a session goes to /account. Inside one, it used to
 * go straight on to /consent — which, for INITE's own apps, is straight back
 * to the app as whoever happened to be signed in, even when the app had sent
 * a login_hint for someone else or the person had opened "Create account".
 * Now the flow continues silently only when nothing says another account is
 * wanted; otherwise the screen asks (AccountChooser).
 */
export function useAuthGate(
  variant: AuthVariant,
  oauthParams: OAuthParams,
  stepUp: boolean,
  accountMode: AccountMode = null,
): AuthGate {
  const router = useRouter()
  const [gate, setGate] = useState<AuthGate>({ checkingAuth: true, signedInAs: null })

  useEffect(() => {
    let cancelled = false
    const show = (signedInAs: AuthGate['signedInAs'] = null) => {
      if (!cancelled) setGate({ checkingAuth: false, signedInAs })
    }

    const checkAuth = async () => {
      try {
        // Step-up: the RP asked for a higher assurance than the current
        // session holds. Don't silently continue on the existing (too-weak)
        // session — force the user to pick a stronger factor. prompt=login
        // likewise asks for a fresh sign-in, whatever the session.
        if (stepUp || accountMode === 'login') return show()

        let token = authStorage.getValidToken()
        let email = token ? tokenEmail(token) : null
        if (!token || !email) {
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
              email = data.user?.email ?? tokenEmail(data.access_token)
            }
          } catch {
            /* ignore */
          }
        }

        if (!token) return show()
        if (!isOAuthFlow(oauthParams)) {
          router.push('/account')
          return
        }
        const hintMismatch =
          !!oauthParams.loginHint && !(email && sameAddress(email, oauthParams.loginHint))
        if (accountMode === 'select' || variant === 'register' || hintMismatch) {
          return show({ email })
        }
        window.location.href = buildConsentUrl(oauthParams)
      } catch {
        show()
      }
    }

    checkAuth()
    return () => {
      cancelled = true
    }
  }, [variant, oauthParams, router, stepUp, accountMode])

  return gate
}

/**
 * Leave the current session and come back to this same screen signed out,
 * with every OAuth param (login_hint included) still in place. The session is
 * the auth server's cookie, so only /oauth/logout can end it.
 */
export function switchAccountHref(variant: AuthVariant, params: OAuthParams): string {
  const back = new URL(
    buildPassthroughHref(variant === 'register' ? '/register' : '/login', params),
    window.location.origin,
  ).toString()
  return `/oauth/logout?post_logout_redirect_uri=${encodeURIComponent(back)}`
}

/**
 * The login <-> register switch. Carries the same PASSTHROUGH list as every
 * other hop, so nonce, resource, acr_values, authorization_details and
 * login_hint survive an invitee clicking "Create account".
 */
export function buildTargetHref(target: '/login' | '/register', params: OAuthParams) {
  return buildPassthroughHref(target, params)
}

export function AuthPageFallback() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <Loader2 className="w-5 h-5 text-[var(--text-faint)] animate-spin" />
    </div>
  )
}
