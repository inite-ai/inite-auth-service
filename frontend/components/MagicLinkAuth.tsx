'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, Loader2, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'

interface MagicLinkAuthProps {
  oauthParams: {
    clientId?: string | null
    redirectUri?: string | null
    scope?: string | null
    state?: string | null
    codeChallenge?: string | null
    codeChallengeMethod?: string | null
  }
}

export default function MagicLinkAuth({ oauthParams }: MagicLinkAuthProps) {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email) {
      toast.error('Please enter your email')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/email/send-magic-link', { email })
      setSent(true)
      toast.success('Magic link sent! Check your email')
    } catch (error: any) {
      console.error('Magic link error:', error)
      toast.error(error.response?.data?.message || 'Failed to send magic link')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', duration: 0.5 }}
          className="text-center"
        >
          <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Check your email
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            We've sent a magic link to
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            {email}
          </p>
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl mb-6">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              The link will expire in 15 minutes. Make sure to check your spam folder.
            </p>
          </div>
          <button
            onClick={() => {
              setSent(false)
              setEmail('')
            }}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Use a different email
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Mail className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Sign in with Email
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          We'll send you a magic link to sign in
        </p>
      </div>

      <form onSubmit={handleSendMagicLink}>
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading || !email}
          className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-4 rounded-xl font-semibold hover:from-purple-600 hover:to-pink-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Mail className="w-5 h-5" />
              Send Magic Link
            </>
          )}
        </button>
      </form>

      <div className="mt-8 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
        <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">
          How it works
        </h4>
        <ol className="text-xs text-purple-700 dark:text-purple-300 space-y-1 list-decimal list-inside">
          <li>Enter your email address</li>
          <li>Check your inbox for the magic link</li>
          <li>Click the link to sign in instantly</li>
          <li>No password required!</li>
        </ol>
      </div>
    </div>
  )
}

