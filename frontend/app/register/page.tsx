'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Fingerprint, Mail, Lock, ArrowRight, Sparkles, Loader2, UserPlus } from 'lucide-react'
import PasskeyAuth from '@/components/PasskeyAuth'
import MagicLinkAuth from '@/components/MagicLinkAuth'
import PasswordAuth from '@/components/PasswordAuth'
import { authStorage } from '@/lib/authStorage'
import { isOAuthFlow, buildConsentUrl } from '@/lib/oauthHelpers'

type AuthMethod = 'passkey' | 'magic-link' | 'password'

function RegisterContent() {
  const [selectedMethod, setSelectedMethod] = useState<AuthMethod | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const clientId = searchParams.get('client_id')
  const redirectUri = searchParams.get('redirect_uri')
  const scope = searchParams.get('scope')
  const state = searchParams.get('state')
  const codeChallenge = searchParams.get('code_challenge')
  const codeChallengeMethod = searchParams.get('code_challenge_method')
  const prompt = searchParams.get('prompt')

  const oauthParams = {
    clientId,
    redirectUri,
    scope,
    state,
    codeChallenge,
    codeChallengeMethod,
    prompt,
  }

  // Check if already authenticated
  useEffect(() => {
    const token = authStorage.getToken()
    
    if (token) {
      if (isOAuthFlow(oauthParams)) {
        router.push(buildConsentUrl(oauthParams))
      } else {
        router.push('/account')
      }
    } else {
      setCheckingAuth(false)
    }
  }, [router, oauthParams])

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    )
  }

  const authMethods = [
    {
      id: 'passkey' as AuthMethod,
      name: 'Passkey',
      description: 'Secure biometric or security key',
      icon: Fingerprint,
      recommended: true,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      id: 'magic-link' as AuthMethod,
      name: 'Email Link',
      description: 'Get a sign-up link via email',
      icon: Mail,
      color: 'from-purple-500 to-pink-500',
    },
    {
      id: 'password' as AuthMethod,
      name: 'Password',
      description: 'Create with email and password',
      icon: Lock,
      color: 'from-gray-500 to-gray-700',
    },
  ]

  if (selectedMethod) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <button
            onClick={() => setSelectedMethod(null)}
            className="mb-4 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition"
          >
            ← Back to methods
          </button>
          
          {selectedMethod === 'passkey' && <PasskeyAuth oauthParams={oauthParams} />}
          {selectedMethod === 'magic-link' && <MagicLinkAuth oauthParams={oauthParams} />}
          {selectedMethod === 'password' && <PasswordAuth oauthParams={oauthParams} />}
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
              <UserPlus className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Create Your Account
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Choose how you want to register
          </p>
          {clientId && (
            <div className="mt-4 inline-flex items-center px-4 py-2 bg-green-50 dark:bg-green-900/20 rounded-full">
              <span className="text-sm text-green-600 dark:text-green-400">
                Registering for <strong className="ml-1">{clientId}</strong>
              </span>
            </div>
          )}
        </motion.div>

        {/* Auth Methods */}
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
              <div className="absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl blur-xl -z-10"
                style={{
                  background: `linear-gradient(to right, ${method.color.split(' ')[1]}, ${method.color.split(' ')[3]})`,
                }}
              />
              <div className="relative bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 h-full border border-gray-200 dark:border-gray-700">
                {method.recommended && (
                  <div className="absolute top-4 right-4">
                    <span className="px-3 py-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-semibold rounded-full">
                      Recommended
                    </span>
                  </div>
                )}
                
                <div className={`w-14 h-14 bg-gradient-to-r ${method.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <method.icon className="w-7 h-7 text-white" />
                </div>
                
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {method.name}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                  {method.description}
                </p>
                
                <div className="flex items-center text-sm font-medium text-green-600 dark:text-green-400 group-hover:translate-x-2 transition-transform duration-300">
                  Get Started
                  <ArrowRight className="w-4 h-4 ml-1" />
                </div>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Already have account */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 text-center"
        >
          <p className="text-gray-600 dark:text-gray-400">
            Already have an account?{' '}
            <a 
              href={clientId ? `/login?client_id=${clientId}&redirect_uri=${redirectUri || ''}&scope=${scope || ''}&state=${state || ''}&code_challenge=${codeChallenge || ''}&code_challenge_method=${codeChallengeMethod || ''}` : '/login'}
              className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
            >
              Sign in
            </a>
          </p>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400"
        >
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

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-12 max-w-md w-full border border-white/20 dark:border-gray-700/20">
          <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto mb-4" />
          <p className="text-center text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <RegisterContent />
    </Suspense>
  )
}

