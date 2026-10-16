'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Mail, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { authStorage } from '@/lib/authStorage'
import { OAuthParams, buildAuthorizeUrl, buildLoginUrl } from '@/lib/oauthHelpers'
import { validateEmail, validatePassword } from '@/lib/validation'
import { useT } from '@/lib/i18n'
import { Input, Button, Card, CardHeader } from '@/components/ui'

/**
 * Forgot / reset password, in two steps on one route:
 *   /reset-password?<oauth params>  -> ask for the email, send the link
 *   /reset-password?token=...       -> set the new password, then resume
 *
 * The OAuth params of the flow the person came from travel with the reset
 * request and are stored server-side next to the token (as on a magic link),
 * so the emailed link stays a bare token and finishing the reset drops an
 * invitee back into the client app that sent them, signed in.
 */

async function postJson(path: string, body: object) {
  // fetch + credentials: the reset sets the session cookie that the resumed
  // /oauth/authorize relies on.
  const response = await fetch(`/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message[0] : data?.message
    throw Object.assign(new Error(message || 'Request failed'), { body: data })
  }
  return data
}

/** Only the params that are present — the DTO rejects nothing it lists, but nulls are noise. */
function presentParams(params: OAuthParams): OAuthParams | undefined {
  if (!params.clientId) return undefined
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value != null && value !== ''),
  ) as OAuthParams
}

export function RequestResetForm({ oauthParams }: { oauthParams: OAuthParams }) {
  const t = useT()
  const [email, setEmail] = useState(oauthParams.loginHint ?? '')
  const [emailTouched, setEmailTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const emailError = emailTouched ? validateEmail(email) : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validateEmail(email)
    if (err) {
      setEmailTouched(true)
      toast.error(err)
      return
    }
    setLoading(true)
    try {
      await postJson('/auth/password/reset-request', {
        email,
        oauthParams: presentParams(oauthParams),
      })
      setSent(true)
    } catch (error: any) {
      toast.error(error?.message || t('auth.reset.error.generic'))
    } finally {
      setLoading(false)
    }
  }

  const backToLogin = buildLoginUrl({ ...oauthParams, loginHint: email || oauthParams.loginHint })

  return (
    <Card>
      <CardHeader
        icon={sent ? <CheckCircle className="w-8 h-8 text-white" /> : <Mail className="w-8 h-8 text-white" />}
        iconClassName="from-gray-600 to-gray-800"
        title={t('auth.reset.request.title')}
        description={sent ? t('auth.reset.request.sent', { email }) : t('auth.reset.request.subtitle')}
      />
      {!sent && (
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <Button type="submit" loading={loading} disabled={!email} icon={<Mail className="w-5 h-5" />}>
            {t('auth.reset.request.cta')}
          </Button>
        </form>
      )}
      <div className="mt-6 text-center">
        <a href={backToLogin} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          {t('auth.reset.backToLogin')}
        </a>
      </div>
    </Card>
  )
}

export function SetPasswordForm({ token, oauthParams }: { token: string; oauthParams: OAuthParams }) {
  const t = useT()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const passwordError = touched ? validatePassword(password) : null
  const confirmError = touched && confirm && confirm !== password ? t('auth.reset.set.mismatch') : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    const err = validatePassword(password) ?? (confirm !== password ? t('auth.reset.set.mismatch') : null)
    if (err) {
      toast.error(err)
      return
    }
    setLoading(true)
    try {
      const data = await postJson('/auth/password/reset', { token, password })
      authStorage.save({ accessToken: data.access_token, userId: data.user?.id })
      toast.success(t('auth.reset.set.success'))

      // The flow stored with the token wins; the page's own query is the
      // fallback (a link built by hand with the params still attached).
      const stored: OAuthParams | null = data.oauth_params ?? null
      const resume = stored?.clientId ? stored : oauthParams
      if (resume.clientId && resume.redirectUri && resume.codeChallenge) {
        // The reset already set the session: /authorize goes straight on to
        // consent or back to the client with a code.
        window.location.href = buildAuthorizeUrl(resume)
      } else if (resume.clientId) {
        window.location.href = buildLoginUrl(resume)
      } else {
        router.push('/account')
      }
    } catch (error: any) {
      const breached = error?.body?.error === 'password_breached'
      toast.error(
        breached
          ? t('auth.password.error.breached', { count: error?.body?.breach_count ?? '?' })
          : error?.message || t('auth.reset.error.generic'),
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<KeyRound className="w-8 h-8 text-white" />}
        iconClassName="from-gray-600 to-gray-800"
        title={t('auth.reset.set.title')}
        description={t('auth.reset.set.subtitle')}
      />
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type={showPassword ? 'text' : 'password'}
          label={t('auth.reset.set.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="••••••••"
          autoComplete="new-password"
          required
          showPasswordToggle
          isPasswordVisible={showPassword}
          onPasswordToggle={() => setShowPassword(!showPassword)}
          error={passwordError ?? undefined}
        />
        <Input
          type={showPassword ? 'text' : 'password'}
          label={t('auth.reset.set.confirm')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          required
          error={confirmError ?? undefined}
        />
        <Button
          type="submit"
          loading={loading}
          disabled={!password || !confirm}
          icon={<KeyRound className="w-5 h-5" />}
        >
          {t('auth.reset.set.cta')}
        </Button>
      </form>
    </Card>
  )
}
