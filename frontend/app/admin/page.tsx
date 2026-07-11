'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart3,
  Users,
  AppWindow,
  Building2,
  Radio,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  FileSearch,
  Loader2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { authStorage } from '@/lib/authStorage'
import { AppHeader } from '@/components/AppHeader'
import {
  StatsSection,
  UsersSection,
  OAuthClientsSection,
  OrganizationsSection,
  SsfStreamsSection,
  FederationSection,
  SamlSection,
  SettingsSection,
  AuditLogSection,
} from '@/components/admin'

type Tab =
  | 'stats'
  | 'users'
  | 'clients'
  | 'orgs'
  | 'signals'
  | 'connections'
  | 'saml'
  | 'audit'
  | 'settings'

const tabs: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
  { key: 'stats', label: 'Dashboard', icon: BarChart3 },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'clients', label: 'OAuth Clients', icon: AppWindow },
  { key: 'orgs', label: 'Organizations', icon: Building2 },
  { key: 'signals', label: 'Shared Signals', icon: Radio },
  { key: 'connections', label: 'Connections', icon: Plug },
  { key: 'saml', label: 'SAML SSO', icon: ShieldCheck },
  { key: 'audit', label: 'Audit Log', icon: FileSearch },
  { key: 'settings', label: 'Settings', icon: SlidersHorizontal },
]

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('stats')
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accessToken, setAccessToken] = useState('')
  const router = useRouter()

  const loadAdmin = useCallback(async () => {
    try {
      let token = authStorage.getValidToken()

      if (!token) {
        try {
          const sessionRes = await api.get('/auth/session/me', {
            withCredentials: true,
          })
          if (sessionRes.data.authenticated && sessionRes.data.access_token) {
            token = sessionRes.data.access_token as string
            authStorage.save({
              accessToken: sessionRes.data.access_token,
              userId: sessionRes.data.user.id,
            })
          }
        } catch {
          // Session check failed
        }
      }

      if (!token) {
        router.push('/login')
        return
      }

      setAccessToken(token)
      const config = { headers: { Authorization: `Bearer ${token}` } }

      // Check admin access by loading stats
      const statsRes = await api.get('/admin/stats', config)
      setStats(statsRes.data)
    } catch (error: any) {
      if (error.response?.status === 403) {
        toast.error('Access denied: admin privileges required')
        router.push('/account')
      } else if (error.response?.status === 401) {
        authStorage.clear()
        router.push('/login')
      } else {
        toast.error('Failed to load admin panel')
        router.push('/account')
      }
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadAdmin()
  }, [loadAdmin])

  const handleLogout = async () => {
    try {
      await api.get('/oauth/logout', { withCredentials: true }).catch(() => {})
    } finally {
      authStorage.clear()
      router.push('/login')
      toast.success('Logged out')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <AppHeader context="Admin" />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-5 h-5 text-[var(--text-faint)] animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AppHeader user={{ id: '', email: 'admin', metadata: { isAdmin: true } }} context="Admin" />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[var(--text)] tracking-tight">
            Admin
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Users, OAuth clients, organizations, and audit log.
          </p>
        </div>

        {/* Tabs — underline-style, Linear pattern. */}
        <div className="border-b border-[var(--border)] mb-6">
          <div className="flex gap-1 -mb-px overflow-x-auto">
            {tabs.map((tab) => {
              const active = activeTab === tab.key
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`h-9 px-3 inline-flex items-center gap-1.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                    active
                      ? 'text-[var(--text)] border-[var(--accent)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)] border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div>
          {activeTab === 'stats' && stats && <StatsSection stats={stats} />}
          {activeTab === 'users' && <UsersSection accessToken={accessToken} />}
          {activeTab === 'clients' && (
            <OAuthClientsSection accessToken={accessToken} />
          )}
          {activeTab === 'orgs' && (
            <OrganizationsSection accessToken={accessToken} />
          )}
          {activeTab === 'signals' && (
            <SsfStreamsSection accessToken={accessToken} />
          )}
          {activeTab === 'connections' && (
            <FederationSection accessToken={accessToken} />
          )}
          {activeTab === 'saml' && <SamlSection accessToken={accessToken} />}
          {activeTab === 'audit' && <AuditLogSection accessToken={accessToken} />}
          {activeTab === 'settings' && (
            <SettingsSection accessToken={accessToken} />
          )}
        </div>
      </div>
    </div>
  )
}
