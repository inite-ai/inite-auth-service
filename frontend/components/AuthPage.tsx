'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Fingerprint,
  Mail,
  Lock,
  ArrowRight,
  Sparkles,
  UserPlus,
  Loader2,
} from 'lucide-react'
import PasskeyAuth from '@/components/PasskeyAuth'
import MagicLinkAuth from '@/components/MagicLinkAuth'
import PasswordAuth from '@/components/PasswordAuth'
import { authStorage } from '@/lib/authStorage'
import { buildConsentUrl, isOAuthFlow, OAuthParams } from '@/lib/oauthHelpers'
import { LocaleSwitcher } from '@/components/ui'

type AuthMethod = 'passkey' | 'magic-link' | 'password'
type AuthVariant = 'login' | 'register'

interface AuthPageProps {
  variant: AuthVariant
}

const variantCopy: Record<
  AuthVariant,
  {
    heroTitle: string
    heroSubtitle: string
    heroIcon: typeof Sparkles
    heroGradient: string
    badgeGradient: string
    ctaText: string
    footerLinkText: string
    footerLinkHref: '/login' | '/register'
    footerLinkColor: string
    loaderIconColor: string
    loaderBackground: string
  }
> = {
  login: {
    heroTitle: 'Welcome to INITE',
    heroSubtitle: 'Choose your preferred way to sign in',
    heroIcon: Sparkles,
    heroGradient: 'from-blue-500 to-purple-600',
    badgeGradient: 'from-blue-500 to-cyan-500',
    ctaText: 'Continue',
    footerLinkText: "Don't have an account? Create one",
    footerLinkHref: '/register',
    footerLinkColor: 'text-green-600 dark:text-green-400',
    loaderIconColor: 'text-blue-500',
    loaderBackground:
      'min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900',
  },
  register: {
    heroTitle: 'Create Your Account',
    heroSubtitle: 'Choose how you want to register',
    heroIcon: UserPlus,
    heroGradient: 'from-green-500 to-emerald-600',
    badgeGradient: 'from-green-500 to-emerald-500',
    ctaText: 'Get Started',
    footerLinkText: 'Already have an account? Sign in',
    footerLinkHref: '/login',
    footerLinkColor: 'text-blue-600 dark:text-blue-400',
    loaderIconColor: 'text-green-500',
    loaderBackground:
      'min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800',
  },
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
      prompt: searchParams.get('prompt'),
    }),
    [searchParams]
  )
}

function useAuthGate(variant: AuthVariant, oauthParams: OAuthParams) {
  const router = useRouter()
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    let cancelled = false

    const checkAuth = async () => {
      try {
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

        // login flow keeps the stronger session-based refresh
        let token = authStorage.getValidToken()
        if (!token) {
          try {
            const response = await fetch('/v1/auth/session/me', { credentials: 'include' })
            const data = await response.json()
            if (data.authenticated && data.access_token) {
              authStorage.save({
                accessToken: data.access_token,
                userId: data.user?.id,
              })
              token = data.access_token
            }
          } catch {
            // ignore session refresh errors, fall through to no-token state
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
  }, [variant, oauthParams, router])

  return checkingAuth
}

function buildTargetHref(
  target: '/login' | '/register',
  { clientId, redirectUri, scope, state, codeChallenge, codeChallengeMethod }: OAuthParams
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

export function AuthPageFallback({ variant }: { variant: AuthVariant }) {
  const copy = variantCopy[variant]
  return (
    <div className={`${copy.loaderBackground} flex items-center justify-center p-4`}>
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-12 max-w-md w-full border border-white/20 dark:border-gray-700/20">
        <Loader2 className={`w-12 h-12 ${copy.loaderIconColor} animate-spin mx-auto mb-4`} />
        <p className="text-center text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  )
}

export default function AuthPage({ variant }: AuthPageProps) {
  const copy = variantCopy[variant]
  const oauthParams = useOAuthParams()
  const checkingAuth = useAuthGate(variant, oauthParams)
  const [selectedMethod, setSelectedMethod] = useState<AuthMethod | null>(null)

  const authMethods = [
    {
      id: 'passkey' as AuthMethod,
      name: 'Passkey',
      description: variant === 'register' ? 'Secure biometric or security key' : 'Use biometrics or security key',
      icon: Fingerprint,
      recommended: true,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      id: 'magic-link' as AuthMethod,
      name: 'Email Link',
      description: variant === 'register' ? 'Get a sign-up link via email' : 'Get a sign-in link via email',
      icon: Mail,
      color: 'from-purple-500 to-pink-500',
    },
    {
      id: 'password' as AuthMethod,
      name: 'Password',
      description:
        variant === 'register' ? 'Create with email and password' : 'Use email and password',
      icon: Lock,
      color: 'from-gray-500 to-gray-700',
    },
  ]

  if (checkingAuth) {
    return (
      <div className={`${copy.loaderBackground} flex items-center justify-center p-4`}>
        <Loader2 className={`w-12 h-12 ${copy.loaderIconColor} animate-spin`} />
      </div>
    )
  }

  if (selectedMethod) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <button
            onClick={() => setSelectedMethod(null)}
            className="mb-4 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition"
          >
            ← Back to methods
          </button>

          {selectedMethod === 'passkey' && (
            <PasskeyAuth oauthParams={oauthParams} initialMode={variant === 'register' ? 'register' : 'login'} />
          )}
          {selectedMethod === 'magic-link' && <MagicLinkAuth oauthParams={oauthParams} />}
          {selectedMethod === 'password' && (
            <PasswordAuth oauthParams={oauthParams} initialMode={variant === 'register' ? 'register' : 'login'} />
          )}
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="flex justify-end mb-4">
          <LocaleSwitcher />
        </div>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <div
              className={`w-16 h-16 bg-gradient-to-br ${copy.heroGradient} rounded-2xl flex items-center justify-center shadow-lg`}
            >
              <copy.heroIcon className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">{copy.heroTitle}</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">{copy.heroSubtitle}</p>
          {oauthParams.clientId && (
            <div className="mt-4 inline-flex items-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-full">
              <span className="text-sm text-blue-600 dark:text-blue-400">
                {variant === 'login' ? 'Signing in to' : 'Registering for'}
                <strong className="ml-1">{oauthParams.clientId}</strong>
              </span>
            </div>
          )}
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {authMethods.map((method, index) => (
            <motion.button
              key={method.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => setSelectedMethod(method.id)}
              className="relative group"
            >
              <div
                className="absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl blur-xl -z-10"
                style={{
                  background: `linear-gradient(to right, ${method.color.split(' ')[1]}, ${method.color.split(' ')[3]})`,
                }}
              />
              <div className="relative bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 h-full border border-gray-200 dark:border-gray-700">
                {method.recommended && (
                  <div className="absolute top-4 right-4">
                    <span
                      className={`px-3 py-1 bg-gradient-to-r ${copy.badgeGradient} text-white text-xs font-semibold rounded-full`}
                    >
                      Recommended
                    </span>
                  </div>
                )}

                <div
                  className={`w-14 h-14 bg-gradient-to-r ${method.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
                >
                  <method.icon className="w-7 h-7 text-white" />
                </div>

                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{method.name}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">{method.description}</p>

                <div className="flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 group-hover:translate-x-2 transition-transform duration-300">
                  {copy.ctaText}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </div>
              </div>
            </motion.button>
          ))}
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mt-8 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            {copy.footerLinkText.split('?')[0]}{' '}
            <a
              href={buildTargetHref(copy.footerLinkHref, oauthParams)}
              className={`${copy.footerLinkColor} font-medium hover:underline`}
            >
              {variant === 'login' ? 'Create one' : 'Sign in'}
            </a>
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            By continuing, you agree to INITE&apos;s{' '}
            <a href="/terms" className="text-blue-600 dark:text-blue-400 hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">
              Privacy Policy
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  )
}

