'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2, Shield, CheckCircle, XCircle, User, Mail, Key, LogOut } from 'lucide-react'
import { motion } from 'framer-motion'
import { authStorage } from '@/lib/authStorage'
import { extractOAuthParams, buildLoginUrl, createAuthorizationCode, buildRedirectWithCode, OAuthParams } from '@/lib/oauthHelpers'
import { Button, Card } from '@/components/ui'

interface UserInfo {
  id: string
  email: string
  name?: string
}

// Client display names
const CLIENT_NAMES: Record<string, string> = {
  'smart-chat': 'Break3',
  'smart-chat-admin': 'Break3 Admin Panel',
  'inite-club': 'INITE Club',
}

// Scope descriptions
const SCOPE_INFO: Record<string, { icon: typeof Key; label: string }> = {
  'openid': { icon: Key, label: 'Verify your identity' },
  'profile': { icon: User, label: 'Access your profile information' },
  'email': { icon: Mail, label: 'View your email address' },
  'admin': { icon: Shield, label: 'Administrative access' },
  'offline_access': { icon: Key, label: 'Stay signed in' },
}

function ConsentContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [oauthParams, setOauthParams] = useState<OAuthParams | null>(null)

  useEffect(() => {
    const params = extractOAuthParams(searchParams)
    setOauthParams(params)

    const checkAuthAndLoadUser = async () => {
      let userId = authStorage.getUserId()
      let token = authStorage.getValidToken()
      
      // If no valid token, try to refresh from session (SSO)
      if (!token) {
        try {
          const response = await fetch('/auth/session/me', {
            credentials: 'include',
          })
          const data = await response.json()
          
          if (data.authenticated && data.access_token) {
            // Save new token from session
            authStorage.save({
              accessToken: data.access_token,
              userId: data.user?.id,
            })
            token = data.access_token
            userId = data.user?.id
          }
        } catch {
          // Session refresh failed
        }
      }
      
      if (!userId || !token) {
        router.push(buildLoginUrl(params))
        return
      }

      // Parse user info from token
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
    }

    checkAuthAndLoadUser()
  }, [searchParams, router])

  const getClientName = () => CLIENT_NAMES[oauthParams?.clientId || ''] || oauthParams?.clientId || 'Unknown App'

  const getScopes = () => {
    const scopes = (oauthParams?.scope || 'openid profile email').split(' ')
    return scopes.filter(s => SCOPE_INFO[s]).map(s => ({ scope: s, ...SCOPE_INFO[s] }))
  }

  const handleApprove = async () => {
    if (!oauthParams?.clientId || !oauthParams?.redirectUri) {
      setError('Missing required parameters')
      return
    }

    setLoading(true)
    try {
      let token = authStorage.getValidToken()
      
      // If token expired, try to refresh from session
      if (!token) {
        try {
          const response = await fetch('/auth/session/me', {
            credentials: 'include',
          })
          const data = await response.json()
          
          if (data.authenticated && data.access_token) {
            authStorage.save({
              accessToken: data.access_token,
              userId: data.user?.id,
            })
            token = data.access_token
          }
        } catch {
          // Session refresh failed
        }
      }
      
      if (!token) {
        router.push(buildLoginUrl(oauthParams))
        return
      }

      const code = await createAuthorizationCode(token, oauthParams)
      window.location.href = buildRedirectWithCode(oauthParams.redirectUri, code, oauthParams.state)
    } catch (err: any) {
      console.error('Authorization error:', err)
      setError(err.message || 'Failed to process authorization')
    } finally {
      setLoading(false)
    }
  }

  const handleDeny = () => {
    if (oauthParams?.redirectUri) {
      const url = new URL(oauthParams.redirectUri)
      url.searchParams.set('error', 'access_denied')
      url.searchParams.set('error_description', 'User denied the request')
      if (oauthParams.state) url.searchParams.set('state', oauthParams.state)
      window.location.href = url.toString()
    } else {
      router.push('/')
    }
  }

  const handleSwitchAccount = () => {
    if (!oauthParams) return
    authStorage.clear()
    const loginPath = buildLoginUrl(oauthParams)
    const fullLoginUrl = new URL(loginPath, window.location.origin).toString()
    window.location.href = `/oauth/logout?post_logout_redirect_uri=${encodeURIComponent(fullLoginUrl)}`
  }

  // Loading state
  if (!user || !oauthParams) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
        <Card className="max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-red-600 mb-2">Authorization Error</h1>
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="max-w-md w-full">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Shield className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Confirm Sign In
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-blue-600">{getClientName()}</span>
              {' '}wants to access your account
            </p>
          </div>

          {/* User info */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-600 to-gray-800 rounded-full flex items-center justify-center shrink-0">
                <User className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {user.name || 'User'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {user.email}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSwitchAccount}
              disabled={loading}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Use another account
            </button>
          </div>

          {/* Permissions */}
          <div className="mb-8">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              This will allow the app to:
            </h3>
            <ul className="space-y-2">
              {getScopes().map(({ scope, icon: Icon, label }) => (
                <li key={scope} className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                  <Icon className="w-5 h-5 text-green-500" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={handleDeny}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              loading={loading}
              icon={!loading && <CheckCircle className="w-5 h-5" />}
              className="flex-1 from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            >
              {loading ? 'Authorizing...' : 'Allow'}
            </Button>
          </div>

          {/* Footer */}
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-6">
            By clicking Allow, you authorize this app to use your information in accordance with their terms of service and privacy policy.
          </p>
        </Card>
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
