'use client'

import { useState } from 'react'
import { KeyRound, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { authStorage } from '@/lib/authStorage'
import { OAuthParams, isOAuthFlow, buildConsentUrl } from '@/lib/oauthHelpers'
import { validateEmail } from '@/lib/validation'
import { Input, Button, Card, CardHeader } from '@/components/ui'

interface OtpAuthProps {
  oauthParams: OAuthParams
}

/**
 * Email one-time-passcode login. Two steps: request a code, then verify it.
 * On success the server establishes the first-party session and returns an
 * access token (same shape as magic-link), so we save it and continue the
 * OAuth flow / land on the account page exactly like the other methods.
 */
export default function OtpAuth({ oauthParams }: OtpAuthProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'request' | 'verify'>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validateEmail(email)
    if (err) {
      toast.error(err)
      return
    }
    setLoading(true)
    try {
      // Always-generic response server-side (no account enumeration).
      await api.post('/auth/otp/request', { email })
      setStep('verify')
      toast.success('Code sent — check your email')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not send a code')
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) {
      toast.error('Enter the 6-digit code')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/auth/otp/verify', { email, code })
      toast.success('Signed in')
      authStorage.save({
        accessToken: data.access_token,
        userId: data.user?.id,
      })
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
        icon={<KeyRound className="w-8 h-8 text-white" />}
        iconClassName="from-sky-500 to-cyan-600"
        title={step === 'request' ? 'Sign in with a code' : 'Enter your code'}
        description={
          step === 'request'
            ? 'We’ll email you a 6-digit one-time code.'
            : `We sent a 6-digit code to ${email}.`
        }
      />

      {step === 'request' ? (
        <form onSubmit={requestCode} className="space-y-6">
          <Input
            type="email"
            label="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            autoComplete="email"
            required
          />
          <Button
            type="submit"
            loading={loading}
            disabled={!email}
            icon={<KeyRound className="w-5 h-5" />}
          >
            {loading ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      ) : (
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
            icon={<KeyRound className="w-5 h-5" />}
          >
            {loading ? 'Verifying…' : 'Verify & sign in'}
          </Button>

          <button
            type="button"
            onClick={() => {
              setStep('request')
              setCode('')
            }}
            className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Use a different email
          </button>
        </form>
      )}
    </Card>
  )
}
