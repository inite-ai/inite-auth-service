'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2, Shield, CheckCircle, XCircle, User, Mail, Key } from 'lucide-react'
import { motion } from 'framer-motion'

interface UserInfo {
  id: string
  email: string
  name?: string
}

function ConsentContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<UserInfo | null>(null)

  const clientId = searchParams.get('client_id')
  const redirectUri = searchParams.get('redirect_uri')
  const scope = searchParams.get('scope')
  const state = searchParams.get('state')
  const codeChallenge = searchParams.get('code_challenge')
  const codeChallengeMethod = searchParams.get('code_challenge_method')

  // Get user info from localStorage
  useEffect(() => {
    const userId = localStorage.getItem('inite_user_id')
    const token = localStorage.getItem('inite_access_token')
    
    if (!userId || !token) {
      // Not logged in, redirect to login
      const loginUrl = new URL('/login', window.location.origin)
      if (clientId) loginUrl.searchParams.set('client_id', clientId)
      if (redirectUri) loginUrl.searchParams.set('redirect_uri', redirectUri)
      if (scope) loginUrl.searchParams.set('scope', scope)
      if (state) loginUrl.searchParams.set('state', state)
      if (codeChallenge) loginUrl.searchParams.set('code_challenge', codeChallenge)
      if (codeChallengeMethod) loginUrl.searchParams.set('code_challenge_method', codeChallengeMethod)
      router.push(loginUrl.pathname + loginUrl.search)
      return
    }

    // Try to get user email from token
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      setUser({
        id: userId,
        email: payload.email || 'Unknown',
        name: payload.name,
      })
    } catch {
      setUser({ id: userId, email: 'Unknown' })
    }
  }, [clientId, redirectUri, scope, state, codeChallenge, codeChallengeMethod, router])

  const getClientDisplayName = (clientId: string | null) => {
    const names: Record<string, string> = {
      'smart-chat': 'Break3',
      'smart-chat-admin': 'Break3 Admin Panel',
      'inite-club': 'INITE Club',
    }
    return names[clientId || ''] || clientId || 'Unknown App'
  }

  const getScopeDescriptions = (scope: string | null) => {
    const scopes = (scope || 'openid profile email').split(' ')
    const descriptions: Record<string, { icon: any; label: string }> = {
      'openid': { icon: Key, label: 'Verify your identity' },
      'profile': { icon: User, label: 'Access your profile information' },
      'email': { icon: Mail, label: 'View your email address' },
      'admin': { icon: Shield, label: 'Administrative access' },
      'offline_access': { icon: Key, label: 'Stay signed in' },
    }
    return scopes
      .filter(s => descriptions[s])
      .map(s => ({ scope: s, ...descriptions[s] }))
  }

  const handleApprove = async () => {
    if (!clientId || !redirectUri) {
      setError('Missing required parameters')
      return
    }

    setLoading(true)
    try {
      const token = localStorage.getItem('inite_access_token')
      
      const response = await fetch('/oauth/create-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          clientId,
          redirectUri,
          scope,
          state,
          codeChallenge,
          codeChallengeMethod,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const url = new URL(redirectUri)
        url.searchParams.set('code', data.code)
        if (state) url.searchParams.set('state', state)
        window.location.href = url.toString()
      } else {
        const errorData = await response.json().catch(() => ({}))
        setError(errorData.message || 'Failed to authorize')
      }
    } catch (err) {
      console.error('Authorization error:', err)
      setError('Failed to process authorization')
    } finally {
      setLoading(false)
    }
  }

  const handleDeny = () => {
    if (redirectUri) {
      const url = new URL(redirectUri)
      url.searchParams.set('error', 'access_denied')
      url.searchParams.set('error_description', 'User denied the request')
      if (state) url.searchParams.set('state', state)
      window.location.href = url.toString()
    } else {
      router.push('/')
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-red-600 mb-2">Authorization Error</h1>
            <p className="text-gray-600 dark:text-gray-400">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Confirm Sign In
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-blue-600">{getClientDisplayName(clientId)}</span>
            {' '}wants to access your account
          </p>
        </div>

        {/* User info */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-600 to-gray-800 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                {user.name || 'User'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {user.email}
              </p>
            </div>
          </div>
        </div>

        {/* Permissions */}
        <div className="mb-8">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            This will allow the app to:
          </h3>
          <ul className="space-y-2">
            {getScopeDescriptions(scope).map(({ scope, icon: Icon, label }) => (
              <li key={scope} className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                <Icon className="w-5 h-5 text-green-500" />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleDeny}
            disabled={loading}
            className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={loading}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium hover:from-blue-600 hover:to-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Allow
              </>
            )}
          </button>
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-6">
          By clicking Allow, you authorize this app to use your information in accordance with their terms of service and privacy policy.
        </p>
      </motion.div>
    </div>
  )
}

export default function ConsentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    }>
      <ConsentContent />
    </Suspense>
  )
}

