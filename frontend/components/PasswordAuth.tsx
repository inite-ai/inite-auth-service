'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, Loader2, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'

interface PasswordAuthProps {
  oauthParams: {
    clientId?: string | null
    redirectUri?: string | null
    scope?: string | null
    state?: string | null
    codeChallenge?: string | null
    codeChallengeMethod?: string | null
  }
}

export default function PasswordAuth({ oauthParams }: PasswordAuthProps) {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email || !password) {
      toast.error('Please fill in all fields')
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

      const { data } = await api.post(endpoint, payload)

      toast.success(mode === 'login' ? 'Logged in successfully!' : 'Account created!')

      // If OAuth flow, redirect through API to set session cookie, then continue OAuth
      if (oauthParams.clientId && oauthParams.redirectUri) {
        // Build the OAuth authorize URL to redirect back to after session is set
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'
        const authorizeUrl = new URL(`${apiUrl}/oauth/authorize`)
        authorizeUrl.searchParams.set('response_type', 'code')
        authorizeUrl.searchParams.set('client_id', oauthParams.clientId)
        authorizeUrl.searchParams.set('redirect_uri', oauthParams.redirectUri)
        if (oauthParams.scope) authorizeUrl.searchParams.set('scope', oauthParams.scope)
        if (oauthParams.state) authorizeUrl.searchParams.set('state', oauthParams.state)
        if (oauthParams.codeChallenge) authorizeUrl.searchParams.set('code_challenge', oauthParams.codeChallenge)
        if (oauthParams.codeChallengeMethod) authorizeUrl.searchParams.set('code_challenge_method', oauthParams.codeChallengeMethod)
        
        // Redirect to session endpoint which will set cookie and redirect to authorize
        const sessionUrl = new URL(`${apiUrl}/oauth/session`)
        sessionUrl.searchParams.set('token', data.access_token)
        sessionUrl.searchParams.set('redirect', authorizeUrl.toString())
        
        window.location.href = sessionUrl.toString()
      } else {
        // Direct login - still set session via redirect
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'
        const sessionUrl = new URL(`${apiUrl}/oauth/session`)
        sessionUrl.searchParams.set('token', data.access_token)
        sessionUrl.searchParams.set('redirect', `${window.location.origin}/account`)
        
        window.location.href = sessionUrl.toString()
      }
    } catch (error: any) {
      console.error('Password auth error:', error)
      toast.error(error.response?.data?.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-gray-600 to-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {mode === 'login' ? 'Sign in with Password' : 'Create Account'}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {mode === 'login' ? 'Use your email and password' : 'Register with email and password'}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {mode === 'register' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-4"
          >
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-gray-500 focus:border-transparent transition"
            />
          </motion.div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-gray-500 focus:border-transparent transition"
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-gray-500 focus:border-transparent transition pr-12"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full bg-gradient-to-r from-gray-600 to-gray-800 text-white py-4 rounded-xl font-semibold hover:from-gray-700 hover:to-gray-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {mode === 'login' ? 'Signing in...' : 'Creating account...'}
            </>
          ) : (
            <>
              <Lock className="w-5 h-5" />
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </>
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <button
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>

      <div className="mt-8 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
        <p className="text-xs text-yellow-800 dark:text-yellow-200">
          ⚠️ Password authentication is provided for backward compatibility. 
          We recommend using Passkey for better security.
        </p>
      </div>
    </div>
  )
}

