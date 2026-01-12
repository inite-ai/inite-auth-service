'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { authStorage } from '@/lib/authStorage'
import { OAuthParams, isOAuthFlow, buildConsentUrl } from '@/lib/oauthHelpers'
import { Input, Button, Card, CardHeader } from '@/components/ui'

interface PasswordAuthProps {
  oauthParams: OAuthParams
  initialMode?: 'login' | 'register'
}

export default function PasswordAuth({ oauthParams, initialMode = 'login' }: PasswordAuthProps) {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
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

      // Use fetch for OAuth flow (needs credentials), axios for direct
      const data = isOAuthFlow(oauthParams)
        ? await fetchWithCredentials(endpoint, payload)
        : (await api.post(endpoint, payload)).data

      toast.success(mode === 'login' ? 'Logged in successfully!' : 'Account created!')

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
      toast.error(error.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<Lock className="w-8 h-8 text-white" />}
        iconClassName="from-gray-600 to-gray-800"
        title={mode === 'login' ? 'Sign in with Password' : 'Create Account'}
        description={mode === 'login' ? 'Use your email and password' : 'Register with email and password'}
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
          placeholder="your@email.com"
          required
        />

        <Input
          type={showPassword ? 'text' : 'password'}
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          showPasswordToggle
          isPasswordVisible={showPassword}
          onPasswordToggle={() => setShowPassword(!showPassword)}
        />

        <Button
          type="submit"
          loading={loading}
          disabled={!email || !password}
          icon={<Lock className="w-5 h-5" />}
          className="from-gray-600 to-gray-800 hover:from-gray-700 hover:to-gray-900 mt-6"
        >
          {loading 
            ? (mode === 'login' ? 'Signing in...' : 'Creating account...')
            : (mode === 'login' ? 'Sign In' : 'Create Account')
          }
        </Button>
      </form>

      <div className="mt-6 text-center">
        <button
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>

      <Card variant="warning" className="mt-8 p-4">
        <p className="text-xs text-yellow-800 dark:text-yellow-200">
          ⚠️ Password authentication is provided for backward compatibility. 
          We recommend using Passkey for better security.
        </p>
      </Card>
    </Card>
  )
}

// Helper for fetch with credentials (needed for cookies in OAuth flow)
async function fetchWithCredentials(endpoint: string, payload: object) {
  const response = await fetch(endpoint, {
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
