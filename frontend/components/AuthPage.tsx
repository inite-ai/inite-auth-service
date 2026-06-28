'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Fingerprint,
  Mail,
  Lock,
  KeyRound,
  ChevronRight,
  Loader2,
  ArrowLeft,
} from 'lucide-react'
import PasskeyAuth from '@/components/PasskeyAuth'
import MagicLinkAuth from '@/components/MagicLinkAuth'
import PasswordAuth from '@/components/PasswordAuth'
import OtpAuth from '@/components/OtpAuth'
import StepUpMfa from '@/components/StepUpMfa'
import SocialLogin from '@/components/SocialLogin'
import { AppHeader } from '@/components/AppHeader'
import { authStorage } from '@/lib/authStorage'
import { buildConsentUrl, isOAuthFlow, OAuthParams } from '@/lib/oauthHelpers'
import { useT } from '@/lib/i18n'

type AuthMethod = 'passkey' | 'magic-link' | 'password' | 'otp'
type AuthVariant = 'login' | 'register'

interface AuthPageProps {
  variant: AuthVariant
}

function useOAuthParams(): OAuthParams {
  const searchParams = useSearchParams()
  return useMemo(
    () => ({
      clientId: searchParams.get('client_id'),
      redirectUri: searchParams.get('redirect_uri'),
      scope: searchParams.get('scope'),
      state: searchParams.get('state'),
      codeChallenge: searchParams.get('code_challenge'),
      codeChallengeMethod: searchParams.get('code_challenge_method'),
      acrValues: searchParams.get('acr_values'),
      prompt: searchParams.get('prompt'),
    }),
    [searchParams],
  )
}

function useAuthGate(
  variant: AuthVariant,
  oauthParams: OAuthParams,
  stepUp: boolean,
) {
  const router = useRouter()
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    let cancelled = false

    const checkAuth = async () => {
      try {
        // Step-up: the RP asked for a higher assurance than the current
        // session holds. Don't silently continue on the existing (too-weak)
        // session — force the user to pick a stronger factor.
        if (stepUp) {
          if (!cancelled) setCheckingAuth(false)
          return
        }
        if (variant === 'register') {
          const token = authStorage.getToken()
          if (token) {
            if (isOAuthFlow(oauthParams)) {
              window.location.href = buildConsentUrl(oauthParams)
            } else {
              router.push('/account')
            }
            return
          }
          if (!cancelled) setCheckingAuth(false)
          return
        }

        let token = authStorage.getValidToken()
        if (!token) {
          try {
            const response = await fetch('/v1/auth/session/me', {
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
            /* ignore */
          }
        }

        if (token) {
          if (isOAuthFlow(oauthParams)) {
            window.location.href = buildConsentUrl(oauthParams)
          } else {
            router.push('/account')
          }
        } else if (!cancelled) {
          setCheckingAuth(false)
        }
      } catch {
        if (!cancelled) setCheckingAuth(false)
      }
    }

    checkAuth()
    return () => {
      cancelled = true
    }
  }, [variant, oauthParams, router, stepUp])

  return checkingAuth
}

function buildTargetHref(
  target: '/login' | '/register',
  {
    clientId,
    redirectUri,
    scope,
    state,
    codeChallenge,
    codeChallengeMethod,
  }: OAuthParams,
) {
  if (!clientId) return target
  const params = new URLSearchParams()
  params.set('client_id', clientId)
  if (redirectUri) params.set('redirect_uri', redirectUri)
  if (scope) params.set('scope', scope)
  if (state) params.set('state', state)
  if (codeChallenge) params.set('code_challenge', codeChallenge)
  if (codeChallengeMethod) params.set('code_challenge_method', codeChallengeMethod)
  return `${target}?${params.toString()}`
}

export function AuthPageFallback() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <Loader2 className="w-5 h-5 text-[var(--text-faint)] animate-spin" />
    </div>
  )
}

export default function AuthPage({ variant }: AuthPageProps) {
  const t = useT()
  const searchParams = useSearchParams()
  const oauthParams = useOAuthParams()
  // RP-driven step-up: /authorize bounced here with step_up=1 because the
  // session's assurance was below the requested acr_values.
  const stepUp = searchParams.get('step_up') === '1'
  const checkingAuth = useAuthGate(variant, oauthParams, stepUp)
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
  const heroTitle = isRegister ? 'Create your INITE account' : 'Sign in to INITE'
  const heroSubtitle = isRegister
    ? 'Pick how you want to register — you can add more methods later.'
    : 'Pick how you want to sign in.'

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
      name: 'Email code',
      description: 'Get a 6-digit one-time code by email',
      icon: KeyRound,
    },
    {
      id: 'password',
      name: t('auth.method.password'),
      description: t('auth.method.password.hint'),
      icon: Lock,
    },
  ]

  if (checkingAuth) return <AuthPageFallback />

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AppHeader hideUserMenu />
      <main className="max-w-md mx-auto px-4 py-12 sm:py-16">
        {stepUp && mfaEligible && !showAllMethods && !selectedMethod ? (
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
              Use another sign-in method
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
                  for{' '}
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
                  This app needs a higher security level. Please re-authenticate
                  with a passkey or a second factor to continue.
                </p>
              )}
            </motion.div>

            <div className="mt-8 border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-elevated)]">
              {methods.map((method, i) => {
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

            <SocialLogin oauthParams={oauthParams} />

            <div className="mt-6 text-sm text-[var(--text-muted)]">
              {isRegister ? 'Already have an account? ' : "Don't have an account? "}
              <a
                href={buildTargetHref(
                  isRegister ? '/login' : '/register',
                  oauthParams,
                )}
                className="text-[var(--accent)] hover:text-[var(--accent-hover)]"
              >
                {isRegister ? 'Sign in' : 'Create one'}
              </a>
            </div>

            <p className="mt-12 text-xs text-[var(--text-faint)] leading-relaxed">
              By continuing, you agree to INITE&apos;s{' '}
              <a href="/terms" className="text-[var(--text-muted)] hover:text-[var(--text)]">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy" className="text-[var(--text-muted)] hover:text-[var(--text)]">
                Privacy Policy
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
              All methods
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
