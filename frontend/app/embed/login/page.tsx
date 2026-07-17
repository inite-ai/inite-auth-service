'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

interface EmbedMessage {
  type:
    | 'inite.auth.success'
    | 'inite.auth.error'
    | 'inite.auth.ready'
  accessToken?: string
  user?: { id: string; email: string; name?: string }
  error?: string
}

function postToParent(msg: EmbedMessage, origin: string) {
  try {
    window.parent.postMessage(msg, origin || '*')
  } catch {
    /* parent gone */
  }
}

function EmbedLoginInner() {
  const params = useSearchParams()
  const clientId = params.get('client_id')

  const [parentOrigin, setParentOrigin] = useState<string>('')
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)

  // Handshake: the embedding parent should post {type:'inite.handshake'}
  // on iframe load so we learn its origin reliably. We also accept the
  // referrer as a fallback. The origin is later validated server-side
  // via the OAuth client's allowedOrigins — postMessage from a hostile
  // parent that lies about its origin can't get a token.
  useEffect(() => {
    const fromReferrer = document.referrer
      ? new URL(document.referrer).origin
      : ''
    if (fromReferrer) setParentOrigin(fromReferrer)

    const onMessage = (e: MessageEvent) => {
      // Only the embedding parent may hand us its origin: a nested or
      // sibling frame posting a forged handshake must not redirect our
      // replies. When the referrer already told us the parent origin,
      // the handshake has to agree with it.
      if (e.source !== window.parent) return
      if (fromReferrer && e.origin !== fromReferrer) return
      if (typeof e.data !== 'object' || e.data == null) return
      if (e.data.type === 'inite.handshake') {
        setParentOrigin(e.origin)
      }
    }
    window.addEventListener('message', onMessage)

    // Tell the parent we're alive so it can stop showing a loading
    // spinner over the iframe.
    postToParent({ type: 'inite.auth.ready' }, fromReferrer || '*')
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const baseHeaders = { 'Content-Type': 'application/json' }

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const r = await fetch('/v1/auth/password/login', {
        method: 'POST',
        headers: baseHeaders,
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      const data = await r.json()
      if (!r.ok) {
        throw new Error(data?.message ?? 'Sign-in failed')
      }
      postToParent(
        {
          type: 'inite.auth.success',
          accessToken: data.access_token,
          user: data.user,
        },
        parentOrigin,
      )
    } catch (e: any) {
      const msg = e?.message ?? 'Sign-in failed'
      setError(msg)
      postToParent({ type: 'inite.auth.error', error: msg }, parentOrigin)
    } finally {
      setLoading(false)
    }
  }

  const handleMagic = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const r = await fetch('/v1/auth/email/send-magic-link', {
        method: 'POST',
        headers: baseHeaders,
        credentials: 'include',
        body: JSON.stringify({ email, clientId }),
      })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        throw new Error(data?.message ?? 'Failed to send magic link')
      }
      setMagicSent(true)
    } catch (e: any) {
      const msg = e?.message ?? 'Failed to send magic link'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (!clientId) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-sm text-red-600">Missing client_id parameter.</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            Sign in
          </h1>
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('password')}
              className={`px-3 py-1 rounded-md ${mode === 'password' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => setMode('magic')}
              className={`px-3 py-1 rounded-md ${mode === 'magic' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}
            >
              Magic link
            </button>
          </div>
        </div>

        {mode === 'password' ? (
          <form onSubmit={handlePassword} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              autoComplete="current-password"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : magicSent ? (
          <p className="text-sm text-gray-600 dark:text-gray-300 py-4 text-center">
            Check <strong>{email}</strong> for a sign-in link. The link opens this
            site in a new tab.
          </p>
        ) : (
          <form onSubmit={handleMagic} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}

        {error && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        <p className="mt-4 text-[10px] text-center text-gray-400 dark:text-gray-500">
          Secured by INITE Identity
        </p>
      </div>
    </main>
  )
}

export default function EmbedLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <EmbedLoginInner />
    </Suspense>
  )
}
