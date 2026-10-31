'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Fingerprint,
  Mail,
  Lock,
  KeyRound,
  Wallet,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react'
import PasskeyAuth from '@/components/PasskeyAuth'
import MagicLinkAuth from '@/components/MagicLinkAuth'
import PasswordAuth from '@/components/PasswordAuth'
import OtpAuth from '@/components/OtpAuth'
import WalletAuth from '@/components/WalletAuth'
import StepUpMfa from '@/components/StepUpMfa'
import SocialLogin from '@/components/SocialLogin'
import { AppHeader } from '@/components/AppHeader'
import { authStorage } from '@/lib/authStorage'
import { useT } from '@/lib/i18n'
import {
  AuthMethod,
  AuthPageFallback,
  AuthPageProps,
  buildTargetHref,
  readAccountMode,
  useAuthGate,
  useOAuthParams,
} from './shared'
import { AccountChooser } from './account-chooser'

export { AuthPageFallback } from './shared'

export default function AuthPage({ variant }: AuthPageProps) {
  const t = useT()
  const searchParams = useSearchParams()
  const oauthParams = useOAuthParams()
  // RP-driven step-up: /authorize bounced here with step_up=1 because the
  // session's assurance was below the requested acr_values.
  const stepUp = searchParams.get('step_up') === '1'
  // /authorize asked which account (src/oauth/account-choice.ts).
  const accountMode = readAccountMode(searchParams.get('account'))
  // A storefront's customer sign-in (src/oauth/customer-lane.ts): customers
  // are passwordless, so only the email code and the sign-in link are offered.
  const customer = searchParams.get('customer') === '1'
  const { checkingAuth, signedInAs } = useAuthGate(variant, oauthParams, stepUp, accountMode)
  const [selectedMethod, setSelectedMethod] = useState<AuthMethod | null>(null)
  // Step-up MFA fast path: when the RP demands higher assurance but the user
  // still holds a valid session, offer the emailed-code widget (raises the
  // session amr) instead of forcing a full re-login. Computed client-side to
  // avoid touching localStorage during SSR.
  const [mfaEligible, setMfaEligible] = useState(false)
  const [showAllMethods, setShowAllMethods] = useState(false)
  useEffect(() => {
    if (stepUp) setMfaEligible(!!authStorage.getValidToken())
  }, [stepUp])

  const isRegister = variant === 'register'
  const heroTitle = isRegister ? t('auth.hero.register.title') : t('auth.welcome.title')
  const heroSubtitle = isRegister
    ? t('auth.hero.register.subtitle')
    : t('auth.hero.login.subtitle')

  const methods: Array<{
    id: AuthMethod
    name: string
    description: string
    icon: typeof Fingerprint
    recommended?: boolean
  }> = [
    {
      id: 'passkey',
      name: t('auth.method.passkey'),
      description: t('auth.method.passkey.hint'),
      icon: Fingerprint,
      recommended: true,
    },
    {
      id: 'magic-link',
      name: t('auth.method.magic'),
      description: t('auth.method.magic.hint'),
      icon: Mail,
    },
    {
      id: 'otp',
      name: t('auth.method.otp'),
      description: t('auth.method.otp.hint'),
      icon: KeyRound,
    },
    {
      id: 'password',
      name: t('auth.method.password'),
      description: t('auth.method.password.hint'),
      icon: Lock,
    },
    {
      id: 'wallet',
      name: t('auth.method.wallet'),
      description: t('auth.method.wallet.hint'),
      icon: Wallet,
    },
  ]
  const shown = customer ? methods.filter((m) => m.id === 'otp' || m.id === 'magic-link') : methods

  if (checkingAuth) return <AuthPageFallback />
  if (signedInAs) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <AppHeader hideUserMenu />
        <main className="max-w-md mx-auto px-4 py-12 sm:py-16">
          <AccountChooser variant={variant} oauthParams={oauthParams} signedInAs={signedInAs} />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AppHeader hideUserMenu />
      <main className="max-w-md mx-auto px-4 py-12 sm:py-16">
        {stepUp && mfaEligible && !customer && !showAllMethods && !selectedMethod ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <StepUpMfa oauthParams={oauthParams} />
            <button
              type="button"
              onClick={() => setShowAllMethods(true)}
              className="mt-6 w-full inline-flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              {t('auth.stepUp.otherMethod')}
            </button>
          </motion.div>
        ) : !selectedMethod ? (
          <>
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <h1 className="text-[28px] leading-tight font-semibold text-[var(--text)] tracking-tight">
                {heroTitle}
              </h1>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {heroSubtitle}
              </p>
              {oauthParams.clientId && (
                <p className="mt-3 text-xs text-[var(--text-faint)]">
                  {t('auth.hero.forClient')}{' '}
                  <span className="font-mono text-[var(--text-muted)]">
                    {oauthParams.clientId}
                  </span>
                </p>
              )}
              {stepUp && (
                <p
                  role="status"
                  className="mt-4 text-xs text-[var(--accent)] bg-[var(--accent-faint)] border border-[color:var(--accent)]/30 rounded-md px-3 py-2"
                >
                  {t('auth.stepUp.notice')}
                </p>
              )}
            </motion.div>

            <div className="mt-8 border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-elevated)]">
              {shown.map((method, i) => {
                const Icon = method.icon
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setSelectedMethod(method.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-overlay)] transition-colors ${
                      i > 0 ? 'border-t border-[var(--border)]' : ''
                    }`}
                  >
                    <span className="w-8 h-8 rounded-md bg-[var(--bg-overlay)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--text)]">
                          {method.name}
                        </span>
                        {method.recommended && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-faint)] text-[var(--accent)] border border-[color:var(--accent)]/30">
                            {t('auth.recommended')}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-[var(--text-muted)] mt-0.5 truncate">
                        {method.description}
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-[var(--text-faint)] shrink-0" />
                  </button>
                )
              })}
            </div>

            {!customer && <SocialLogin oauthParams={oauthParams} />}

            <div className="mt-6 text-sm text-[var(--text-muted)]">
              {isRegister ? t('auth.switch.haveAccount') : t('auth.switch.noAccount')}{' '}
              <a
                href={buildTargetHref(
                  isRegister ? '/login' : '/register',
                  oauthParams,
                )}
                className="text-[var(--accent)] hover:text-[var(--accent-hover)]"
              >
                {isRegister ? t('auth.switch.signIn') : t('auth.switch.create')}
              </a>
            </div>

            <p className="mt-12 text-xs text-[var(--text-faint)] leading-relaxed">
              {t('auth.legal.prefix')}{' '}
              <a href="/terms" className="text-[var(--text-muted)] hover:text-[var(--text)]">
                {t('auth.legal.terms')}
              </a>{' '}
              {t('auth.legal.and')}{' '}
              <a href="/privacy" className="text-[var(--text-muted)] hover:text-[var(--text)]">
                {t('auth.legal.privacy')}
              </a>
              .
            </p>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <button
              type="button"
              onClick={() => setSelectedMethod(null)}
              className="mb-5 inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t('auth.allMethods')}
            </button>

            {selectedMethod === 'passkey' && (
              <PasskeyAuth
                oauthParams={oauthParams}
                initialMode={isRegister ? 'register' : 'login'}
              />
            )}
            {selectedMethod === 'magic-link' && (
              <MagicLinkAuth oauthParams={oauthParams} />
            )}
            {selectedMethod === 'otp' && <OtpAuth oauthParams={oauthParams} />}
            {selectedMethod === 'wallet' && (
              <WalletAuth oauthParams={oauthParams} />
            )}
            {selectedMethod === 'password' && (
              <PasswordAuth
                oauthParams={oauthParams}
                initialMode={isRegister ? 'register' : 'login'}
              />
            )}
          </motion.div>
        )}
      </main>
    </div>
  )
}
