'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { authStorage } from '@/lib/authStorage'
import { asList } from './shared'
import type { AccountUser, SecurityStatus, Passkey, LinkedWallet } from './types'

/** A resource that can be present, still arriving, or independently broken. */
export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string }

export interface AccountData {
  token: string
  user: Loadable<AccountUser>
  security: Loadable<SecurityStatus>
  passkeys: Loadable<Passkey[]>
  wallets: Loadable<LinkedWallet[]>
}

function isUnauthorized(error: any): boolean {
  return error?.response?.status === 401 || error?.response?.status === 403
}

function toLoadable<T>(
  result: PromiseSettledResult<{ data: T }>,
  /** Coerce the payload before it reaches render — see `asList`. */
  normalise: (value: unknown) => T = (value) => value as T,
): Loadable<T> {
  if (result.status === 'fulfilled') {
    return { status: 'ready', data: normalise(result.value.data) }
  }
  const message =
    result.reason?.response?.data?.message ??
    result.reason?.message ??
    'Request failed'
  return { status: 'error', message }
}

/**
 * Load everything the account page renders.
 *
 * The previous implementation ran the four requests through `Promise.all`
 * inside one try/catch whose handler cleared the stored token and redirected
 * to /login. Any failure at all — a 500 from the passkey list, a dropped
 * connection — therefore signed the user out of an account that was working
 * fine. Here each resource settles on its own: only a genuine 401/403 (or a
 * missing token) means "not signed in", and a section that fails renders its
 * own error with a retry while the rest of the page keeps working.
 */
export function useAccountData() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [state, setState] = useState<Omit<AccountData, 'token'>>({
    user: { status: 'loading' },
    security: { status: 'loading' },
    passkeys: { status: 'loading' },
    wallets: { status: 'loading' },
  })

  /** Resolve a usable access token: stored one first, then the SSO session. */
  const resolveToken = useCallback(async (): Promise<string | null> => {
    const stored = authStorage.getValidToken()
    if (stored) return stored

    try {
      const { data } = await api.get('/auth/session/me', { withCredentials: true })
      if (data.authenticated && data.access_token) {
        authStorage.save({ accessToken: data.access_token, userId: data.user.id })
        return data.access_token as string
      }
    } catch {
      // No SSO session either — fall through to the sign-in redirect.
    }
    return null
  }, [])

  const load = useCallback(async () => {
    const active = await resolveToken()
    if (!active) {
      authStorage.clear()
      router.push('/login')
      return
    }
    setToken(active)

    const config = { headers: { Authorization: `Bearer ${active}` } }
    const [user, wallets, passkeys, security] = await Promise.allSettled([
      api.get<AccountUser>('/auth/identity/me', config),
      api.get<LinkedWallet[]>('/auth/identity/wallets', config),
      api.get<Passkey[]>('/auth/passkey/list', config),
      api.get<SecurityStatus>('/auth/identity/security-status', config),
    ])

    // Identity is the one request whose rejection can mean "not signed in".
    if (user.status === 'rejected' && isUnauthorized(user.reason)) {
      authStorage.clear()
      router.push('/login')
      return
    }

    setState({
      user: toLoadable(user),
      wallets: toLoadable(wallets, asList<LinkedWallet>),
      passkeys: toLoadable(passkeys, asList<Passkey>),
      security: toLoadable(security),
    })
  }, [resolveToken, router])

  useEffect(() => {
    load()
  }, [load])

  return { token, ...state, reload: load }
}
