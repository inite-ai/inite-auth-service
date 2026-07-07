'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { authStorage } from '@/lib/authStorage'
import { AppHeader } from '@/components/AppHeader'
import {
  ProfileSection,
  SecuritySection,
  SecurityAuditSection,
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
      // Get valid (non-expired) token
      let token = authStorage.getValidToken()
      
      // If no valid token, try to get fresh one from session (SSO)
      if (!token) {
        try {
          const sessionRes = await api.get('/auth/session/me', {
            withCredentials: true,
          })
          
          if (sessionRes.data.authenticated && sessionRes.data.access_token) {
            token = sessionRes.data.access_token as string
            // Save to localStorage for future requests
            authStorage.save({
              accessToken: sessionRes.data.access_token,
              userId: sessionRes.data.user.id,
            })
          }
        } catch {
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
        api.get('/auth/identity/me', config),
        api.get('/auth/identity/wallets', config),
        api.get('/auth/passkey/list', config),
        api.get('/auth/identity/security-status', config),
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
        await api.delete('/auth/session', {
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
      <div className="min-h-screen bg-[var(--bg)]">
        <AppHeader user={user} context="Account" />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-5 h-5 text-[var(--text-faint)] animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AppHeader user={user} context="Account" />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)] tracking-tight">
            Account
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Manage your identity, devices, and security.
          </p>
        </div>

        {/* Main Content */}
        <div className="mt-6 space-y-4">
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

          {/* Recent Activity (audit log) */}
          {accessToken && <SecurityAuditSection accessToken={accessToken} />}

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
        <div className="mt-12 pt-6 border-t border-[var(--border)] text-center">
          <p className="text-xs text-[var(--text-faint)]">
            INITE Identity Provider · Your identity, your control
          </p>
        </div>
      </div>
    </div>
  )
}
