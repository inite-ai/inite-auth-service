'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Fingerprint, CheckCircle } from 'lucide-react'
import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthnAutofill,
} from '@simplewebauthn/browser'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { authStorage } from '@/lib/authStorage'
import { OAuthParams, isOAuthFlow, buildConsentUrl } from '@/lib/oauthHelpers'
import { Input, Button, Card, CardHeader } from '@/components/ui'

interface PasskeyAuthProps {
  oauthParams: OAuthParams
  initialMode?: 'login' | 'register'
}

export default function PasskeyAuth({ oauthParams, initialMode = 'login' }: PasskeyAuthProps) {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  // Registration: the email is proven with a one-time code before anything is
  // created, then the passkey is added to the now signed-in account. 'failed'
  // is a signed-in user whose authenticator said no: they may retry or go on.
  const [step, setStep] = useState<'email' | 'code' | 'failed'>('email')
  const signedInToken = useRef<string | null>(null)
  const router = useRouter()
  // Guards the conditional-UI ceremony so React Strict Mode's double-invoke
  // (and mode toggles) don't kick off two concurrent autofill requests.
  const conditionalStarted = useRef(false)

  // Verify a WebAuthn assertion and complete the login. The challenge is
  // intentionally NOT sent — the server stored it in Redis when /options was
  // called and reads it back from there to prevent replay (older builds
  // trusted the client-supplied challenge, which defeated WebAuthn). Shared by
  // the explicit "Authenticate" button and the conditional-UI autofill path.
  const completeAuthentication = async (
    response: Awaited<ReturnType<typeof startAuthentication>>,
  ) => {
    const { data } = await api.post('/auth/passkey/authentication/verify', {
      response,
    })

    toast.success('Authenticated successfully!')
    authStorage.save({
      accessToken: data.access_token,
      userId: data.user?.id,
    })

    proceed()
  }

  // window.location.href for OAuth to force a full reload + session check.
  const proceed = () => {
    if (isOAuthFlow(oauthParams)) {
      window.location.href = buildConsentUrl(oauthParams)
    } else {
      router.push('/account')
    }
  }

  // Conditional UI / passkey autofill. When the browser supports it, we open a
  // discoverable-credential ceremony with mediation:'conditional' (via
  // useBrowserAutofill) that stays dormant until the user selects a passkey
  // from the browser's autofill dropdown on the username field. It's
  // best-effort: any rejection (unsupported, dismissed, or aborted because the
  // user started an explicit flow) is swallowed. simplewebauthn's internal
  // abort service cancels this ceremony when startAuthentication/Registration
  // is called again, so the explicit buttons take over cleanly.
  useEffect(() => {
    if (mode !== 'login' || conditionalStarted.current) return
    let cancelled = false
    void (async () => {
      try {
        if (!(await browserSupportsWebAuthnAutofill())) return
        conditionalStarted.current = true
        const { data: options } = await api.post(
          '/auth/passkey/authentication/options',
          {},
        )
        const response = await startAuthentication({
          optionsJSON: options,
          useBrowserAutofill: true,
        })
        if (!cancelled) await completeAuthentication(response)
      } catch (error) {
        if (!cancelled) console.debug('Conditional passkey UI ended:', error)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const handlePasskeyLogin = async () => {
    setLoading(true)
    try {
      // Discoverable-credential challenge: the authenticator offers the
      // passkeys it holds for this site. The server no longer scopes by email.
      const { data: options } = await api.post('/auth/passkey/authentication/options', {})

      // Start WebAuthn authentication (v13 signature: { optionsJSON }).
      const response = await startAuthentication({ optionsJSON: options })
      await completeAuthentication(response)
    } catch (error: any) {
      console.error('Passkey auth error:', error)
      const message = error.response?.data?.message || 'Authentication failed'

      // Not switching to registration here: for someone who already has an
      // account that only led to "already exists" and back again.
      if (message.includes('not found')) {
        toast.error(
          'This passkey is not registered here. Sign in with an email code, then add a passkey.',
        )
      } else {
        toast.error(message)
      }
    } finally {
      setLoading(false)
    }
  }

  const requestCode = async () => {
    if (!email) {
      toast.error('Please enter your email')
      return
    }
    setLoading(true)
    try {
      // Always-generic response server-side: it does not say whether the
      // address already has an account. It does not need to — the code works
      // for both, and an existing account simply gets a passkey added.
      await api.post('/auth/otp/request', { email })
      setStep('code')
      toast.success('Code sent — check your email')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not send a code')
    } finally {
      setLoading(false)
    }
  }

  const createPasskey = async (token: string) => {
    const auth = { headers: { Authorization: `Bearer ${token}` } }
    const { data: options } = await api.post('/auth/passkey/registration/options', {}, auth)
    // Server keeps the expected challenge in Redis; the client never sends it.
    const response = await startRegistration({ optionsJSON: options })
    await api.post('/auth/passkey/registration/verify', { response }, auth)
    toast.success('Passkey added')
    proceed()
  }

  const verifyCodeAndRegister = async () => {
    if (!/^\d{6}$/.test(code)) {
      toast.error('Enter the 6-digit code')
      return
    }
    setLoading(true)
    try {
      // Proves the address, creates the account if there is none, and starts
      // the session — the same call the email-code sign-in makes.
      const { data } = await api.post('/auth/otp/verify', { email, code })
      signedInToken.current = data.access_token
      authStorage.save({ accessToken: data.access_token, userId: data.user?.id })
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Invalid or expired code')
      setLoading(false)
      return
    }
    try {
      await createPasskey(signedInToken.current!)
    } catch (error: any) {
      console.error('Passkey registration error:', error)
      toast.error(error.response?.data?.message || 'The passkey was not created')
      setStep('failed')
    } finally {
      setLoading(false)
    }
  }

  const retryPasskey = async () => {
    if (!signedInToken.current) return
    setLoading(true)
    try {
      await createPasskey(signedInToken.current)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'The passkey was not created')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login')
    setStep('email')
    setCode('')
  }

  return (
    <Card>
      <CardHeader
        icon={<Fingerprint className="w-8 h-8 text-white" />}
        iconClassName="from-violet-500 to-purple-600"
        title={mode === 'login' ? 'Sign in with Passkey' : 'Create a passkey'}
        description={mode === 'login'
          ? 'Use your fingerprint, face, or security key'
          : 'Confirm your email with a code, then save a passkey on this device'
        }
      />

      <div className="space-y-6">
        {mode === 'login' && (
          <>
            <Input
              type="email"
              name="username"
              // "username webauthn" lets supporting browsers surface saved
              // passkeys in the autofill dropdown for this field, driving the
              // conditional-UI ceremony started on mount. Nothing typed here
              // is sent: the browser offers the passkeys it has for this site.
              autoComplete="username webauthn"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
            />
            <Button onClick={handlePasskeyLogin} loading={loading} icon={<Fingerprint className="w-5 h-5" />}>
              {loading ? 'Authenticating...' : 'Sign in with a passkey'}
            </Button>
          </>
        )}

        {mode === 'register' && step === 'email' && (
          <>
            <Input
              type="email"
              name="email"
              autoComplete="email"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
            />
            <Button onClick={requestCode} loading={loading} disabled={!email} icon={<Fingerprint className="w-5 h-5" />}>
              {loading ? 'Sending…' : 'Send a code'}
            </Button>
          </>
        )}

        {mode === 'register' && step === 'code' && (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              We sent a 6-digit code to <span className="font-medium">{email}</span>. Enter it, then confirm the passkey on your device.
            </p>
            <Input
              type="text"
              name="one-time-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              label="Code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              required
            />
            <Button onClick={verifyCodeAndRegister} loading={loading} disabled={code.length !== 6} icon={<Fingerprint className="w-5 h-5" />}>
              {loading ? 'Creating your passkey…' : 'Confirm and create passkey'}
            </Button>
            <button type="button" onClick={() => setStep('email')} className="text-sm text-gray-500 hover:underline">
              Use a different email
            </button>
          </>
        )}

        {mode === 'register' && step === 'failed' && (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              You are signed in, but the passkey was not created. Try again, or continue and add one later in account settings.
            </p>
            <Button onClick={retryPasskey} loading={loading} icon={<Fingerprint className="w-5 h-5" />}>
              Try again
            </Button>
            <button type="button" onClick={proceed} className="text-sm text-violet-600 dark:text-violet-400 hover:underline">
              Continue without a passkey
            </button>
          </>
        )}
      </div>

      <div className="mt-6 text-center">
        <button
          onClick={switchMode}
          className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
        >
          {mode === 'login' ? "Don't have a passkey? Create one" : 'Already have a passkey? Sign in'}
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-4"
      >
        <Card variant="success" className="mt-8 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Most Secure Option
              </p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                Passkeys are phishing-resistant and don't require passwords.
              </p>
            </div>
          </div>
        </Card>
        
        <p className="text-xs text-center text-gray-500 dark:text-gray-500">
          On Safari/iOS: Select "This Device" to use Touch ID or Face ID
        </p>
      </motion.div>
    </Card>
  )
}
