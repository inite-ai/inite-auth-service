'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Fingerprint, Loader2 } from 'lucide-react'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'

interface PasskeyAuthProps {
  oauthParams: {
    clientId?: string | null
    redirectUri?: string | null
    scope?: string | null
    state?: string | null
    codeChallenge?: string | null
    codeChallengeMethod?: string | null
    prompt?: string | null
  }
}

export default function PasskeyAuth({ oauthParams }: PasskeyAuthProps) {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const router = useRouter()

  const handlePasskeyLogin = async () => {
    setLoading(true)
    try {
      // Get authentication options
      const { data: options } = await api.post('/auth/passkey/authentication/options', {
        email: email || undefined,
      })

      // Start WebAuthn authentication
      const response = await startAuthentication(options)

      // Verify authentication
      const { data } = await api.post('/auth/passkey/authentication/verify', {
        response,
        challenge: options.challenge,
      })

      toast.success('Authenticated successfully!')

      // If OAuth flow, generate auth code and redirect
      if (oauthParams.clientId && oauthParams.redirectUri) {
        await handleOAuthRedirect(data.access_token)
      } else {
        // Direct login
        router.push('/account')
      }
    } catch (error: any) {
      console.error('Passkey auth error:', error)
      toast.error(error.response?.data?.message || 'Authentication failed')
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
      // First register with email/password to get account
      const { data: authData } = await api.post('/auth/password/register', {
        email,
        password: Math.random().toString(36),
        name: email.split('@')[0],
      })

      // Get registration options
      const { data: options } = await api.post(
        '/auth/passkey/registration/options',
        {},
        {
          headers: { Authorization: `Bearer ${authData.access_token}` },
        }
      )

      // Start WebAuthn registration
      const response = await startRegistration(options)

      // Verify registration
      await api.post(
        '/auth/passkey/registration/verify',
        {
          response,
          challenge: options.challenge,
        },
        {
          headers: { Authorization: `Bearer ${authData.access_token}` },
        }
      )

      toast.success('Passkey registered successfully!')
      
      // Now try login
      setTimeout(() => handlePasskeyLogin(), 1000)
    } catch (error: any) {
      console.error('Passkey registration error:', error)
      toast.error(error.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthRedirect = async (accessToken: string) => {
    try {
      // Create authorization code
      const { data } = await api.post(
        '/oauth/create-code',
        {
          clientId: oauthParams.clientId,
          redirectUri: oauthParams.redirectUri,
          scope: oauthParams.scope,
          state: oauthParams.state,
          codeChallenge: oauthParams.codeChallenge,
          codeChallengeMethod: oauthParams.codeChallengeMethod,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )

      // Redirect with code
      const url = new URL(oauthParams.redirectUri!)
      url.searchParams.set('code', data.code)
      if (oauthParams.state) url.searchParams.set('state', oauthParams.state)
      
      window.location.href = url.toString()
    } catch (error) {
      console.error('OAuth redirect error:', error)
      toast.error('Failed to complete authentication')
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Fingerprint className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {mode === 'login' ? 'Sign in with Passkey' : 'Create Passkey Account'}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {mode === 'login'
            ? 'Use your biometric or security key'
            : 'Register a new passkey for secure authentication'}
        </p>
      </div>

      {mode === 'register' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mb-6"
        >
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </motion.div>
      )}

      <button
        onClick={mode === 'login' ? handlePasskeyLogin : handlePasskeyRegister}
        disabled={loading || (mode === 'register' && !email)}
        className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white py-4 rounded-xl font-semibold hover:from-blue-600 hover:to-cyan-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {mode === 'login' ? 'Authenticating...' : 'Creating...'}
          </>
        ) : (
          <>
            <Fingerprint className="w-5 h-5" />
            {mode === 'login' ? 'Authenticate' : 'Create Passkey'}
          </>
        )}
      </button>

      <div className="mt-6 text-center">
        <button
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {mode === 'login' ? "Don't have a passkey? Register" : 'Already have a passkey? Sign in'}
        </button>
      </div>

      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
          Why Passkeys?
        </h4>
        <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <li>✓ No passwords to remember</li>
          <li>✓ Biometric authentication</li>
          <li>✓ Phishing-resistant</li>
          <li>✓ Works across devices</li>
        </ul>
      </div>
    </div>
  )
}

