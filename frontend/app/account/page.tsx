'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { LogOut, ArrowLeft, Shield, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { authStorage } from '@/lib/authStorage'
import {
  ProfileSection,
  SecuritySection,
  PasskeysSection,
  WalletsSection,
  SessionsSection,
  DangerZoneSection,
} from '@/components/account'

export default function AccountPage() {
  const [user, setUser] = useState<any>(null)
  const [wallets, setWallets] = useState<any[]>([])
  const [passkeys, setPasskeys] = useState<any[]>([])
  const [securityStatus, setSecurityStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string>('')
  const router = useRouter()

  const loadUserData = useCallback(async () => {
    try {
      let token = authStorage.getToken()
      
      // If no token in localStorage, try to get from session (SSO)
      if (!token) {
        try {
          const sessionRes = await api.get('/auth/session/me', {
            withCredentials: true,
          })
          
          if (sessionRes.data.authenticated && sessionRes.data.access_token) {
            token = sessionRes.data.access_token
            // Save to localStorage for future requests
            authStorage.save({
              accessToken: token,
              userId: sessionRes.data.user.id,
            })
          }
        } catch (e) {
          // Session check failed, continue to login redirect
        }
      }

      if (!token) {
        router.push('/login')
        return
      }

      setAccessToken(token)
      const config = { headers: { Authorization: `Bearer ${token}` } }

      const [userRes, walletsRes, passkeysRes, securityRes] = await Promise.all([
        api.get('/identity/me', config),
        api.get('/identity/wallets', config),
        api.get('/auth/passkey/list', config),
        api.get('/identity/security-status', config),
      ])

      setUser(userRes.data)
      setWallets(walletsRes.data)
      setPasskeys(passkeysRes.data)
      setSecurityStatus(securityRes.data)
    } catch (error) {
      console.error('Load user data error:', error)
      toast.error('Failed to load account data')
      authStorage.clear()
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadUserData()
  }, [loadUserData])

  const handleLogout = async () => {
    try {
      // Revoke session on server
      await api.get('/oauth/logout', { withCredentials: true }).catch(() => {})
      // Optionally revoke tokens
      if (accessToken) {
        await api.delete('/session', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => {})
      }
    } finally {
      authStorage.clear()
      router.push('/login')
      toast.success('Logged out successfully')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Shield className="w-6 h-6 text-violet-400" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-violet-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-fuchsia-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-500" />
      </div>

      <div className="relative max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                Account Settings
                <Sparkles className="w-6 h-6 text-violet-400" />
              </h1>
              <p className="text-slate-400 mt-1">Manage your identity and security</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-slate-800/50 text-slate-300 rounded-xl hover:bg-slate-700/50 border border-slate-700/50 transition flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </motion.div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Profile Section */}
          <ProfileSection
            user={user}
            accessToken={accessToken}
            onUpdate={loadUserData}
          />

          {/* Security Section */}
          {securityStatus && (
            <SecuritySection
              securityStatus={securityStatus}
              accessToken={accessToken}
              onUpdate={loadUserData}
            />
          )}

          {/* Passkeys Section */}
          <PasskeysSection
            passkeys={passkeys}
            accessToken={accessToken}
            onUpdate={loadUserData}
          />

          {/* Wallets Section */}
          <WalletsSection
            wallets={wallets}
            userDid={user?.did}
            accessToken={accessToken}
            onUpdate={loadUserData}
          />

          {/* Sessions Section */}
          <SessionsSection accessToken={accessToken} />

          {/* Danger Zone */}
          <DangerZoneSection
            user={user}
            accessToken={accessToken}
            onDeleteAccount={handleLogout}
          />
        </div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-12 text-center"
        >
          <p className="text-sm text-slate-500">
            INITE Identity Provider • Secure Decentralized Authentication
          </p>
          <p className="text-xs text-slate-600 mt-2">
            Your identity, your control
          </p>
        </motion.div>
      </div>
    </div>
  )
}
