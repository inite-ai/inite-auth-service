'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'

function VerifyContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  const verifyMagicLink = useCallback(async (token: string) => {
    try {
      const { data } = await api.get(`/auth/email/verify?token=${token}`)
      
      // Store access token
      localStorage.setItem('inite_access_token', data.access_token)
        localStorage.setItem('inite_user_id', data.user?.id || '')
      
      setStatus('success')
      setMessage(data.is_new_user ? 'Account created successfully!' : 'Signed in successfully!')
      
      // Redirect to account page after 2 seconds
      setTimeout(() => {
        router.push('/account')
      }, 2000)
    } catch (error: any) {
      console.error('Verify magic link error:', error)
      setStatus('error')
      setMessage(error.response?.data?.message || 'Verification failed')
      toast.error('Magic link verification failed')
    }
  }, [router])

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
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-12 text-center max-w-md border border-gray-200 dark:border-gray-700"
      >
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
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Verification Failed
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{message}</p>
            <button
              onClick={() => router.push('/login')}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
            >
              Back to Login
            </button>
          </>
        )}
      </motion.div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-12 text-center max-w-md border border-gray-200 dark:border-gray-700">
          <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Loading...
          </h2>
        </div>
      </div>
    }>
      <VerifyContent />
    </Suspense>
  )
}

