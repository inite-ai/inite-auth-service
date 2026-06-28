'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { authStorage } from '@/lib/authStorage'
import { OAuthParams, isOAuthFlow, buildConsentUrl } from '@/lib/oauthHelpers'
import { validateEmail, validatePassword } from '@/lib/validation'
import { useT } from '@/lib/i18n'
import { Input, Button, Card, CardHeader } from '@/components/ui'

interface PasswordAuthProps {
  oauthParams: OAuthParams
  initialMode?: 'login' | 'register'
}

export default function PasswordAuth({ oauthParams, initialMode = 'login' }: PasswordAuthProps) {
  const t = useT()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordTouched, setPasswordTouched] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [name, setName] = useState('')
  const router = useRouter()

  const emailError = emailTouched ? validateEmail(email) : null
  const passwordError =
    passwordTouched && mode === 'register' ? validatePassword(password) : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const eErr = validateEmail(email)
    const pErr = mode === 'register' ? validatePassword(password) : null
    if (eErr || pErr) {
      setEmailTouched(true)
      setPasswordTouched(true)
      toast.error(eErr ?? pErr ?? 'Please fix the highlighted fields')
      return
    }

    setLoading(true)
    try {
      const endpoint = mode === 'login' 
        ? '/auth/password/login' 
        : '/auth/password/register'
      
      const payload = mode === 'login'
        ? { email, password }
        : { email, password, name: name || email.split('@')[0] }

      // Use fetch for OAuth flow (needs credentials), axios for direct
      const data = isOAuthFlow(oauthParams)
        ? await fetchWithCredentials(endpoint, payload)
        : (await api.post(endpoint, payload)).data

      toast.success(
        mode === 'login'
          ? t('auth.password.success.login')
          : t('auth.password.success.register'),
      )

      // Save auth data
      authStorage.save({
        accessToken: data.access_token,
        userId: data.user?.id,
      })

      // Redirect based on flow
      // Use window.location.href for OAuth to ensure full page reload and session check
      if (isOAuthFlow(oauthParams)) {
        // Small delay to ensure session is saved on server
        setTimeout(() => {
          window.location.href = buildConsentUrl(oauthParams)
        }, 100)
      } else {
        router.push('/account')
      }
    } catch (error: any) {
      console.error('Password auth error:', error)
      // The backend surfaces breached-password reject as a structured
      // 400. Show a more useful message than the generic "Authentication
      // failed" so the user picks a different password.
      const breached =
        error?.response?.data?.error === 'password_breached' ||
        error?.body?.error === 'password_breached' ||
        /password_breached/.test(String(error?.message ?? ''))
      if (breached) {
        const count =
          error?.response?.data?.breach_count ?? error?.body?.breach_count ?? '?'
        toast.error(t('auth.password.error.breached', { count }))
      } else {
        toast.error(
          error?.response?.data?.message ||
            error.message ||
            t('auth.password.error.generic'),
        )
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<Lock className="w-8 h-8 text-white" />}
        iconClassName="from-gray-600 to-gray-800"
        title={
          mode === 'login'
            ? t('auth.password.title.login')
            : t('auth.password.title.register')
        }
        description={
          mode === 'login'
            ? t('auth.password.subtitle.login')
            : t('auth.password.subtitle.register')
        }
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
          >
            <Input
              type="text"
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </motion.div>
        )}

        <Input
          type="email"
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          placeholder="your@email.com"
          autoComplete="email"
          required
          error={emailError ?? undefined}
        />

        <Input
          type={showPassword ? 'text' : 'password'}
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setPasswordTouched(true)}
          placeholder="••••••••"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          showPasswordToggle
          isPasswordVisible={showPassword}
          onPasswordToggle={() => setShowPassword(!showPassword)}
          error={passwordError ?? undefined}
        />

        <Button
          type="submit"
          loading={loading}
          disabled={!email || !password}
          icon={<Lock className="w-5 h-5" />}
          className="from-gray-600 to-gray-800 hover:from-gray-700 hover:to-gray-900 mt-6"
        >
          {loading
            ? mode === 'login'
              ? t('auth.password.cta.loading.login')
              : t('auth.password.cta.loading.register')
            : mode === 'login'
              ? t('auth.password.cta.login')
              : t('auth.password.cta.register')}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <button
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {mode === 'login'
            ? t('auth.password.switch.toRegister')
            : t('auth.password.switch.toLogin')}
        </button>
      </div>

      <Card variant="warning" className="mt-8 p-4">
        <p className="text-xs text-yellow-800 dark:text-yellow-200">
          ⚠️ {t('auth.password.warning')}
        </p>
      </Card>
    </Card>
  )
}

// Helper for fetch with credentials (needed for cookies in OAuth flow).
// Mirrors the /v1 prefix that lib/api.ts applies to axios calls.
async function fetchWithCredentials(endpoint: string, payload: object) {
  const url = endpoint.startsWith('/v1/') ? endpoint : `/v1${endpoint}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Request failed')
  }

  return response.json()
}
