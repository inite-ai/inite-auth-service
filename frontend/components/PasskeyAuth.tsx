'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Fingerprint, Loader2, CheckCircle } from 'lucide-react'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { authStorage } from '@/lib/authStorage'
import { OAuthParams, isOAuthFlow, buildConsentUrl } from '@/lib/oauthHelpers'

interface PasskeyAuthProps {
  oauthParams: OAuthParams
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

      // Save auth data
      authStorage.save({
        accessToken: data.access_token,
        userId: data.user?.id,
      })

      // Redirect based on flow
      if (isOAuthFlow(oauthParams)) {
        router.push(buildConsentUrl(oauthParams))
      } else {
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
      // First, create user account
      const { data: authData } = await api.post('/auth/magic-link/request', {
        email,
        skipEmail: true,
      })

      // Get registration options
      const { data: options } = await api.post(
        '/auth/passkey/registration/options',
        {},
        { headers: { Authorization: `Bearer ${authData.access_token}` } }
      )

      // Start WebAuthn registration
      const response = await startRegistration(options)

      // Verify registration
      await api.post(
        '/auth/passkey/registration/verify',
        { response, challenge: options.challenge },
        { headers: { Authorization: `Bearer ${authData.access_token}` } }
      )

      toast.success('Passkey registered successfully!')
      
      // Auto-login after registration
      setTimeout(() => handlePasskeyLogin(), 1000)
    } catch (error: any) {
      console.error('Passkey registration error:', error)
      toast.error(error.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Fingerprint className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {mode === 'login' ? 'Sign in with Passkey' : 'Register Passkey'}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {mode === 'login' 
            ? 'Use your fingerprint, face, or security key' 
            : 'Create a new passkey for passwordless login'}
        </p>
      </div>

      {mode === 'register' && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
          />
        </div>
      )}

      {mode === 'login' && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Email (optional)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Filter by email..."
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
          />
        </div>
      )}

      <button
        onClick={mode === 'login' ? handlePasskeyLogin : handlePasskeyRegister}
        disabled={loading || (mode === 'register' && !email)}
        className="w-full bg-gradient-to-r from-violet-500 to-purple-600 text-white py-4 rounded-xl font-semibold hover:from-violet-600 hover:to-purple-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {mode === 'login' ? 'Authenticating...' : 'Registering...'}
          </>
        ) : (
          <>
            <Fingerprint className="w-5 h-5" />
            {mode === 'login' ? 'Authenticate' : 'Register Passkey'}
          </>
        )}
      </button>

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
        className="mt-8 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl"
      >
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Most Secure Option
            </p>
            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
              Passkeys are phishing-resistant and don't require passwords.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
