'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { CheckCircle, Loader2, XCircle, ExternalLink } from 'lucide-react'
import api from '@/lib/api'
import { authStorage } from '@/lib/authStorage'
import { OAuthParams } from '@/lib/oauthHelpers'
import toast from 'react-hot-toast'
import { Card, Button } from '@/components/ui'

type VerifyStatus = 'loading' | 'success' | 'success-oauth' | 'error'

// Client name mapping for better UX
const CLIENT_NAMES: Record<string, string> = {
  'smart-chat': 'Smart Chat',
  'inite-club': 'INITE Club',
  'smar-chat-admin': 'Admin Panel',
}

function VerifyContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<VerifyStatus>('loading')
  const [message, setMessage] = useState('')
  const [oauthParams, setOauthParams] = useState<OAuthParams | null>(null)

  const verifyMagicLink = useCallback(async (token: string) => {
    try {
      const { data } = await api.get(`/auth/email/verify?token=${token}`)
      
      // Store auth data
      authStorage.save({
        accessToken: data.access_token,
        userId: data.user?.id,
      })
      
      setMessage(data.is_new_user ? 'Account created successfully!' : 'Signed in successfully!')
      
      // Check if this was an OAuth flow
      const params: OAuthParams | null = data.oauth_params
      if (params?.clientId && params?.redirectUri) {
        // OAuth flow - show "Continue" button instead of auto-redirect
        // This is needed because magic link opens in new tab, losing OAuth state
        setOauthParams(params)
        setStatus('success-oauth')
      } else {
        // Direct auth - redirect to account page
        setStatus('success')
        setTimeout(() => router.push('/account'), 2000)
      }
    } catch (error: any) {
      console.error('Verify magic link error:', error)
      setStatus('error')
      setMessage(error.response?.data?.message || 'Verification failed')
      toast.error('Magic link verification failed')
    }
  }, [router])

  // Continue OAuth flow - redirect back to the app which will start a new OAuth flow
  // Since user is now authenticated, the new flow will auto-approve
  const handleContinueToApp = () => {
    if (!oauthParams?.redirectUri) return
    
    // Extract base URL from redirectUri (remove /callback or /oauth/callback)
    const redirectUrl = new URL(oauthParams.redirectUri)
    const baseUrl = redirectUrl.origin
    
    // Redirect to app's main page - app will detect no auth and start OAuth again
    // This time user is authenticated so it will be seamless
    window.location.href = baseUrl
  }

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setStatus('error')
      setMessage('No verification token provided')
      return
    }
    verifyMagicLink(token)
  }, [searchParams, verifyMagicLink])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <Card className="p-12 text-center max-w-md">
          {status === 'loading' && (
            <>
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Verifying...
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Please wait while we verify your magic link
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', duration: 0.5 }}
              >
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {message}
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Redirecting to your account...
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                You can add a passkey for faster login in your account settings.
              </p>
            </>
          )}

          {status === 'success-oauth' && (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', duration: 0.5 }}
              >
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {message}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Click below to continue to {CLIENT_NAMES[oauthParams?.clientId || ''] || 'the app'}
              </p>
              <Button 
                onClick={handleContinueToApp}
                className="w-full"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Continue to {CLIENT_NAMES[oauthParams?.clientId || ''] || 'App'}
              </Button>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
                You'll be signed in automatically
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Verification Failed
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">{message}</p>
              <Button onClick={() => router.push('/login')}>
                Back to Login
              </Button>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="p-12 text-center max-w-md">
          <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Loading...
          </h2>
        </Card>
      </div>
    }>
      <VerifyContent />
    </Suspense>
  )
}
