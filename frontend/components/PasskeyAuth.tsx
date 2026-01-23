'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Fingerprint, CheckCircle } from 'lucide-react'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
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
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const router = useRouter()

  const handlePasskeyLogin = async () => {
    setLoading(true)
    try {
      // Get authentication options (always uses platform authenticator)
      const { data: options } = await api.post('/auth/passkey/authentication/options', {
        email: email || undefined,
      })

      console.log('🔐 WebAuthn authentication options:', JSON.stringify(options, null, 2))

      // Start WebAuthn authentication
      const response = await startAuthentication(options)

      // Verify authentication
      const { data } = await api.post('/auth/passkey/authentication/verify', {
        response,
        challenge: options.challenge,
      })

      toast.success('Authenticated successfully!')

      // Save auth data
      authStorage.save({
        accessToken: data.access_token,
        userId: data.user?.id,
      })

      // Redirect based on flow
      // Use window.location.href for OAuth to ensure full page reload and session check
      if (isOAuthFlow(oauthParams)) {
        window.location.href = buildConsentUrl(oauthParams)
      } else {
        router.push('/account')
      }
    } catch (error: any) {
      console.error('Passkey auth error:', error)
      const message = error.response?.data?.message || 'Authentication failed'
      
      // If passkey not found, suggest registering
      if (message.includes('not found')) {
        toast.error('Passkey not found. Try registering a new passkey for your account.')
        setMode('register')
      } else {
        toast.error(message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePasskeyRegister = async () => {
    if (!email) {
      toast.error('Please enter your email')
      return
    }

    setLoading(true)
    try {
      // Check if user exists
      const { data: checkData } = await api.post('/auth/passkey/prepare-registration', {
        email,
        allowExisting: true,
      })

      // If this is an existing user, they need to sign in first
      // Then they can add a passkey in their account settings
      if (checkData.isExistingUser) {
        toast.error('This email already has an account. Sign in first using Magic Link or Password, then add a passkey in account settings.')
        setMode('login')
        setLoading(false)
        return
      }

      // New user - proceed with passkey registration
      // Get registration options (always uses platform authenticator)
      const { data: options } = await api.post(
        '/auth/passkey/registration/options',
        {},
        { headers: { Authorization: `Bearer ${checkData.access_token}` } }
      )

      console.log('🔐 WebAuthn registration options:', JSON.stringify(options, null, 2))

      // Start WebAuthn registration
      const response = await startRegistration(options)

      // Verify registration
      await api.post(
        '/auth/passkey/registration/verify',
        { response, challenge: options.challenge },
        { headers: { Authorization: `Bearer ${checkData.access_token}` } }
      )

      toast.success('Passkey registered successfully!')

      // Save auth data
      authStorage.save({
        accessToken: checkData.access_token,
        userId: checkData.user?.id,
      })

      // Redirect based on flow
      if (isOAuthFlow(oauthParams)) {
        setTimeout(() => {
          window.location.href = buildConsentUrl(oauthParams)
        }, 100)
      } else {
        router.push('/account')
      }
    } catch (error: any) {
      console.error('Passkey registration error:', error)
      toast.error(error.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<Fingerprint className="w-8 h-8 text-white" />}
        iconClassName="from-violet-500 to-purple-600"
        title={mode === 'login' ? 'Sign in with Passkey' : 'Register Passkey'}
        description={mode === 'login' 
          ? 'Use your fingerprint, face, or security key' 
          : 'Create a new passkey for passwordless login'
        }
      />

      <div className="space-y-6">
        <Input
          type="email"
          label={mode === 'register' ? 'Email' : 'Email (optional)'}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={mode === 'register' ? 'your@email.com' : 'Filter by email...'}
          required={mode === 'register'}
        />

        <Button
          onClick={mode === 'login' ? handlePasskeyLogin : handlePasskeyRegister}
          loading={loading}
          disabled={mode === 'register' && !email}
          icon={<Fingerprint className="w-5 h-5" />}
        >
          {loading 
            ? (mode === 'login' ? 'Authenticating...' : 'Registering...')
            : (mode === 'login' ? 'Authenticate' : 'Register Passkey')
          }
        </Button>
      </div>

      <div className="mt-6 text-center">
        <button
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
        >
          {mode === 'login' ? "Don't have a passkey? Register one" : 'Already have a passkey? Sign in'}
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
