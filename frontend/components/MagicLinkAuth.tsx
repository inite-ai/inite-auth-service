'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { OAuthParams } from '@/lib/oauthHelpers'
import { validateEmail } from '@/lib/validation'
import { useT } from '@/lib/i18n'
import { Input, Button, Card, CardHeader } from '@/components/ui'

interface MagicLinkAuthProps {
  oauthParams: OAuthParams
}

export default function MagicLinkAuth({ oauthParams }: MagicLinkAuthProps) {
  const t = useT()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [sent, setSent] = useState(false)

  const emailError = emailTouched ? validateEmail(email) : null

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()

    const eErr = validateEmail(email)
    if (eErr) {
      setEmailTouched(true)
      toast.error(eErr)
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
      toast.success(t('auth.magic.success'))
    } catch (error: any) {
      console.error('Magic link error:', error)
      toast.error(
        error.response?.data?.message || t('auth.magic.error.generic'),
      )
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
            {t('auth.magic.sent.title')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {t('auth.magic.sent.subtitle')}
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            {email}
          </p>
          <Card variant="warning" className="p-4 mb-6">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              {t('auth.magic.sent.expiry')}
            </p>
          </Card>
          <button
            onClick={() => {
              setSent(false)
              setEmail('')
            }}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t('auth.magic.sent.useDifferent')}
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
        title={t('auth.magic.title')}
        description={t('auth.magic.subtitle')}
      />

      <form onSubmit={handleSendMagicLink} className="space-y-6">
        <Input
          type="email"
          label="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          placeholder="your@email.com"
          autoComplete="email"
          required
          error={emailError ?? undefined}
        />

        <Button
          type="submit"
          loading={loading}
          disabled={!email}
          icon={<Mail className="w-5 h-5" />}
          className="from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
        >
          {loading ? t('auth.magic.cta.sending') : t('auth.magic.cta.send')}
        </Button>
      </form>

      <Card variant="info" className="mt-8 p-4">
        <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">
          {t('auth.magic.howItWorks.title')}
        </h4>
        <ol className="text-xs text-purple-700 dark:text-purple-300 space-y-1 list-decimal list-inside">
          <li>{t('auth.magic.howItWorks.1')}</li>
          <li>{t('auth.magic.howItWorks.2')}</li>
          <li>{t('auth.magic.howItWorks.3')}</li>
          <li>{t('auth.magic.howItWorks.4')}</li>
        </ol>
      </Card>
    </Card>
  )
}
