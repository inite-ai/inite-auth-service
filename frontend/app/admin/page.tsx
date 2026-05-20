'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Shield,
  ArrowLeft,
  BarChart3,
  Users,
  AppWindow,
  FileSearch,
  LogOut,
  Loader2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { authStorage } from '@/lib/authStorage'
import {
  StatsSection,
  UsersSection,
  OAuthClientsSection,
  AuditLogSection,
} from '@/components/admin'

type Tab = 'stats' | 'users' | 'clients' | 'audit'

const tabs: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
  { key: 'stats', label: 'Dashboard', icon: BarChart3 },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'clients', label: 'OAuth Clients', icon: AppWindow },
  { key: 'audit', label: 'Audit Log', icon: FileSearch },
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
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-violet-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-fuchsia-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative max-w-6xl mx-auto py-8 px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/account')}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                Admin Panel
                <Shield className="w-6 h-6 text-violet-400" />
              </h1>
              <p className="text-slate-400 mt-1">Manage users and applications</p>
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

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex gap-2 mb-6"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition flex items-center gap-2 ${
                activeTab === tab.key
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25'
                  : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50 border border-slate-700/50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </motion.div>

        {/* Content */}
        <div className="space-y-6">
          {activeTab === 'stats' && stats && <StatsSection stats={stats} />}
          {activeTab === 'users' && <UsersSection accessToken={accessToken} />}
          {activeTab === 'clients' && <OAuthClientsSection accessToken={accessToken} />}
          {activeTab === 'audit' && <AuditLogSection accessToken={accessToken} />}
        </div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-12 text-center"
        >
          <p className="text-sm text-slate-500">
            INITE Identity Provider — Admin Panel
          </p>
        </motion.div>
      </div>
    </div>
  )
}
