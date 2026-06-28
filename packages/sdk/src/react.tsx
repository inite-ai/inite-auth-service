import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { IniteAuth } from './index'
import type {
  IniteAuthOptions,
  IniteAuthSession,
  IniteAuthUser,
} from './index'

interface AuthContextValue {
  client: IniteAuth
  user: IniteAuthUser | null
  accessToken: string | null
  loading: boolean
  loginWithPassword: IniteAuth['loginWithPassword']
  registerWithPassword: IniteAuth['registerWithPassword']
  sendMagicLink: IniteAuth['sendMagicLink']
  logout: () => Promise<void>
  refresh: () => Promise<IniteAuthSession | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export interface IniteAuthProviderProps extends IniteAuthOptions {
  children: ReactNode
  /**
   * If true (default), hydrate from cookies on mount via /session/me.
   * Disable for SSR-only pages that don't need a live check.
   */
  autoHydrate?: boolean
}

export function IniteAuthProvider({
  children,
  autoHydrate = true,
  ...options
}: IniteAuthProviderProps) {
  // Build the client exactly once; recreating it on prop change would
  // wipe in-memory session state mid-flight.
  const clientRef = useRef<IniteAuth | null>(null)
  if (!clientRef.current) {
    clientRef.current = new IniteAuth(options)
  }
  const client = clientRef.current

  const [session, setSession] = useState<IniteAuthSession | null>(() =>
    client.getSessionSync(),
  )
  const [loading, setLoading] = useState(autoHydrate)

  useEffect(() => {
    const unsubscribe = client.onAuthStateChange((s) => setSession(s))
    let cancelled = false
    if (autoHydrate) {
      client
        .getSession()
        .catch(() => null)
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [client, autoHydrate])

  const value = useMemo<AuthContextValue>(
    () => ({
      client,
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      loading,
      loginWithPassword: (input) => client.loginWithPassword(input),
      registerWithPassword: (input) => client.registerWithPassword(input),
      sendMagicLink: (input) => client.sendMagicLink(input),
      logout: () => client.logout(),
      refresh: () => client.getSession(),
    }),
    [client, session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error(
      'useAuth must be used within an <IniteAuthProvider>. Did you forget to wrap your tree?',
    )
  }
  return ctx
}
