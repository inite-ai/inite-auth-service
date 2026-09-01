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

/** Outcome of looking for a usable access token. */
type TokenResult =
  | { status: 'ok'; token: string }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }

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

  /**
   * Resolve a usable access token: stored one first, then the SSO session.
   *
   * The three outcomes are kept apart deliberately. Collapsing them into
   * "no token" meant a 502 from a restarting backend was indistinguishable
   * from being signed out, so a deploy bounced signed-in users to /login and
   * cleared their stored token — the session in Redis was fine the whole
   * time, but the page had already given up on it.
   */
  const resolveToken = useCallback(async (): Promise<TokenResult> => {
    const stored = authStorage.getValidToken()
    if (stored) return { status: 'ok', token: stored }

    try {
      const { data } = await api.get('/auth/session/me', { withCredentials: true })
      if (data.authenticated && data.access_token) {
        authStorage.save({ accessToken: data.access_token, userId: data.user.id })
        return { status: 'ok', token: data.access_token as string }
      }
      // A 200 saying "not authenticated" is a real answer, not a blip.
      return { status: 'unauthenticated' }
    } catch (error: any) {
      if (isUnauthorized(error)) return { status: 'unauthenticated' }
      return {
        status: 'error',
        message: error?.response?.data?.message ?? error?.message ?? 'Request failed',
      }
    }
  }, [])

  const load = useCallback(async () => {
    const resolved = await resolveToken()

    if (resolved.status === 'unauthenticated') {
      authStorage.clear()
      router.push('/login')
      return
    }

    // Reachability problem, not an auth problem: keep the stored token and
    // let every section offer a retry instead of ending the session.
    if (resolved.status === 'error') {
      const failed: Loadable<never> = { status: 'error', message: resolved.message }
      setState({ user: failed, security: failed, passkeys: failed, wallets: failed })
      return
    }

    const active = resolved.token
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
