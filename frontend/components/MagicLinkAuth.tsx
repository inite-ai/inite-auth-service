'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { OAuthParams } from '@/lib/oauthHelpers'
import { Input, Button, Card, CardHeader } from '@/components/ui'

interface MagicLinkAuthProps {
  oauthParams: OAuthParams
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
      // Include OAuth params so magic link can continue the flow
      await api.post('/auth/email/send-magic-link', { 
        email,
        oauthParams: oauthParams.clientId ? oauthParams : undefined,
      })
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
      <Card>
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
            We&apos;ve sent a magic link to
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            {email}
          </p>
          <Card variant="warning" className="p-4 mb-6">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              The link will expire in 15 minutes. Make sure to check your spam folder.
            </p>
          </Card>
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
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        icon={<Mail className="w-8 h-8 text-white" />}
        iconClassName="from-purple-500 to-pink-500"
        title="Sign in with Email"
        description="We'll send you a magic link to sign in"
      />

      <form onSubmit={handleSendMagicLink} className="space-y-6">
        <Input
          type="email"
          label="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
        />

        <Button
          type="submit"
          loading={loading}
          disabled={!email}
          icon={<Mail className="w-5 h-5" />}
          className="from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
        >
          {loading ? 'Sending...' : 'Send Magic Link'}
        </Button>
      </form>

      <Card variant="info" className="mt-8 p-4">
        <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">
          How it works
        </h4>
        <ol className="text-xs text-purple-700 dark:text-purple-300 space-y-1 list-decimal list-inside">
          <li>Enter your email address</li>
          <li>Check your inbox for the magic link</li>
          <li>Click the link to sign in instantly</li>
          <li>No password required!</li>
        </ol>
      </Card>
    </Card>
  )
}
