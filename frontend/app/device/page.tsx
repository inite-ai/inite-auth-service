'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Tv,
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
  ArrowRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { authStorage } from '@/lib/authStorage'
import { AppHeader } from '@/components/AppHeader'

/**
 * OAuth 2.0 Device Authorization Grant (RFC 8628) — verification UI.
 *
 * The device prints `?user_code=ABCD-EFGH` (or the user types it).
 * We resolve the row, demand the user be authenticated, then show
 * a one-screen approve/deny.
 */
function DeviceVerifyContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [userCode, setUserCode] = useState(searchParams.get('user_code') ?? '')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [device, setDevice] = useState<{
    user_code: string
    client_id: string
    scope: string | null
    status: string
    expires_at: string
  } | null>(null)
  const [result, setResult] = useState<'approved' | 'denied' | null>(null)

  // Require an authenticated session before showing the approve UI.
  const [authChecked, setAuthChecked] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    const check = async () => {
      const token = authStorage.getValidToken()
      if (token) {
        setAuthed(true)
        setAuthChecked(true)
        return
      }
      try {
        const res = await fetch('/v1/auth/session/me', { credentials: 'include' })
        const data = await res.json()
        if (data.authenticated && data.access_token) {
          authStorage.save({
            accessToken: data.access_token,
            userId: data.user?.id,
          })
          setAuthed(true)
        }
      } catch {
        /* not logged in */
      } finally {
        setAuthChecked(true)
      }
    }
    check()
  }, [])

  const lookupCode = async (codeOverride?: string) => {
    const code = (codeOverride ?? userCode).trim().toUpperCase()
    if (!code) {
      toast.error('Enter the code shown on your device')
      return
    }
    setLookupBusy(true)
    try {
      const { data } = await api.get(`/oauth/device?user_code=${encodeURIComponent(code)}`)
      setDevice(data)
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Code not found or expired'
      toast.error(msg)
      setDevice(null)
    } finally {
      setLookupBusy(false)
    }
  }

  // Auto-lookup if the user followed verification_uri_complete.
  useEffect(() => {
    const presetCode = searchParams.get('user_code')
    if (presetCode && authChecked) {
      lookupCode(presetCode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, authChecked])

  const decide = async (decision: 'approve' | 'deny') => {
    if (!device) return
    setActionBusy(true)
    try {
      const token = authStorage.getValidToken()
      await api.post(
        '/oauth/device/approve',
        { user_code: device.user_code, decision },
        token ? { headers: { Authorization: `Bearer ${token}` } } : {},
      )
      setResult(decision === 'approve' ? 'approved' : 'denied')
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Approval failed')
    } finally {
      setActionBusy(false)
    }
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 max-w-md w-full text-center"
        >
          <Shield className="w-12 h-12 text-violet-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Sign in to continue</h1>
          <p className="text-slate-400 text-sm mb-6">
            You need to be signed in to approve a device.
          </p>
          <button
            onClick={() =>
              router.push(
                `/login?return=${encodeURIComponent(
                  `/device${userCode ? `?user_code=${userCode}` : ''}`,
                )}`,
              )
            }
            className="w-full px-4 py-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl font-medium hover:opacity-90 transition"
          >
            Sign in
          </button>
        </motion.div>
      </div>
    )
  }

  if (result) {
    const ok = result === 'approved'
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 max-w-md w-full text-center"
        >
          {ok ? (
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
          ) : (
            <XCircle className="w-16 h-16 text-rose-400 mx-auto mb-4" />
          )}
          <h1 className="text-2xl font-bold text-white mb-2">
            {ok ? 'Device approved' : 'Device denied'}
          </h1>
          <p className="text-slate-400 text-sm">
            {ok
              ? 'You can close this tab. The device will finish signing in shortly.'
              : 'You denied this device. It will not receive access.'}
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AppHeader context="Authorize device" />
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-6 max-w-md mx-auto mt-12"
      >
        <div className="text-center mb-6">
          <Tv className="w-12 h-12 text-violet-400 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-white mb-1">Authorize device</h1>
          <p className="text-slate-400 text-sm">
            Enter the code shown on your TV / CLI / IoT device.
          </p>
        </div>

        {!device && (
          <div className="space-y-4">
            <input
              autoFocus
              value={userCode}
              onChange={(e) => setUserCode(e.target.value.toUpperCase())}
              placeholder="ABCD-EFGH"
              maxLength={9}
              className="w-full px-5 py-4 bg-slate-800/50 border border-slate-600 rounded-xl text-white text-center font-mono tracking-[0.3em] text-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
            />
            <button
              onClick={() => lookupCode()}
              disabled={lookupBusy || !userCode.trim()}
              className="w-full px-4 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {lookupBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}

        {device && (
          <div className="space-y-4">
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                Device wants to sign in as
              </p>
              <p className="text-white font-mono text-sm">{device.client_id}</p>
              {device.scope && (
                <>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mt-3 mb-1">
                    Requested scopes
                  </p>
                  <p className="text-slate-300 text-sm font-mono">{device.scope}</p>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => decide('deny')}
                disabled={actionBusy}
                className="flex-1 px-4 py-3 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition disabled:opacity-50"
              >
                Deny
              </button>
              <button
                onClick={() => decide('approve')}
                disabled={actionBusy}
                className="flex-1 px-4 py-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Approve
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}

export default function DeviceVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        </div>
      }
    >
      <DeviceVerifyContent />
    </Suspense>
  )
}
