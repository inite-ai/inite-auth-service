'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ShieldCheck, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { authStorage } from '@/lib/authStorage'
import { OAuthParams, isOAuthFlow, buildConsentUrl } from '@/lib/oauthHelpers'
import { Input, Button, Card, CardHeader } from '@/components/ui'

interface StepUpMfaProps {
  oauthParams: OAuthParams
}

/**
 * Step-up MFA "enter code" widget. Unlike OtpAuth (a login factor, keyed by
 * email), this raises the assurance of an ALREADY-authenticated session: it
 * calls /v1/auth/otp/mfa/{request,verify} with the current access token, and
 * the verify raises the session amr so the bounced /authorize step-up passes.
 *
 * The code is emailed automatically on mount; verifying continues the OAuth
 * flow (consent) or lands on the account page, mirroring the other methods.
 */
export default function StepUpMfa({ oauthParams }: StepUpMfaProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [code, setCode] = useState('')
  // Guards against the dev/StrictMode double-invoke emailing two codes.
  const requestedRef = useRef(false)

  const authHeader = () => {
    const token = authStorage.getToken()
    return token ? { Authorization: `Bearer ${token}` } : undefined
  }

  const sendCode = useCallback(async (announce: boolean) => {
    try {
      await api.post(
        '/auth/otp/mfa/request',
        { channel: 'email' },
        { headers: authHeader() },
      )
      if (announce) toast.success('Code sent — check your email')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not send a code')
    }
  }, [])

  useEffect(() => {
    if (requestedRef.current) return
    requestedRef.current = true
    void sendCode(false)
  }, [sendCode])

  const resend = async () => {
    setResending(true)
    await sendCode(true)
    setResending(false)
  }

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) {
      toast.error('Enter the 6-digit code')
      return
    }
    setLoading(true)
    try {
      await api.post(
        '/auth/otp/mfa/verify',
        { code },
        { headers: authHeader() },
      )
      toast.success('Verified')
      if (isOAuthFlow(oauthParams)) {
        window.location.href = buildConsentUrl(oauthParams)
      } else {
        router.push('/account')
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Invalid or expired code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<ShieldCheck className="w-8 h-8 text-white" />}
        iconClassName="from-emerald-500 to-teal-600"
        title="Confirm it’s you"
        description="We emailed a 6-digit security code to raise your session’s assurance level."
      />

      <form onSubmit={verifyCode} className="space-y-6">
        <Input
          type="text"
          label="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
        />
        <Button
          type="submit"
          loading={loading}
          disabled={code.length !== 6}
          icon={<ShieldCheck className="w-5 h-5" />}
        >
          {loading ? 'Verifying…' : 'Verify & continue'}
        </Button>

        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
          {resending ? 'Sending…' : 'Resend code'}
        </button>
      </form>
    </Card>
  )
}
