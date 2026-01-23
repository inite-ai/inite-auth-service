'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Monitor, Smartphone, Globe, Trash2, LogOut, Clock, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'

interface SessionsSectionProps {
  accessToken: string
}

interface Session {
  id: string
  clientName?: string
  createdAt: string
  expiresAt: string
}

export default function SessionsSection({ accessToken }: SessionsSectionProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [revokingAll, setRevokingAll] = useState(false)

  const loadSessions = async () => {
    try {
      const { data } = await api.get('/auth/session/active', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      setSessions(data)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [accessToken])

  const handleRevokeSession = async (sessionId: string) => {
    setDeletingId(sessionId)
    try {
      await api.delete(`/session/${sessionId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      toast.success('Session revoked')
      loadSessions()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to revoke session')
    } finally {
      setDeletingId(null)
    }
  }

  const handleRevokeAllSessions = async () => {
    setRevokingAll(true)
    try {
      await api.delete('/session', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      toast.success('All sessions revoked')
      loadSessions()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to revoke sessions')
    } finally {
      setRevokingAll(false)
    }
  }

  const getSessionIcon = (clientName?: string) => {
    if (!clientName) return <Globe className="w-5 h-5" />
    if (clientName.toLowerCase().includes('mobile')) return <Smartphone className="w-5 h-5" />
    return <Monitor className="w-5 h-5" />
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    return date.toLocaleDateString()
  }

  const isExpiringSoon = (expiresAt: string) => {
    const expires = new Date(expiresAt)
    const now = new Date()
    const diff = expires.getTime() - now.getTime()
    return diff < 24 * 60 * 60 * 1000 // Less than 24 hours
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border border-slate-700/50 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
            <Monitor className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Active Sessions</h2>
            <p className="text-sm text-slate-400">Manage your logged-in devices</p>
          </div>
        </div>
        {sessions.length > 1 && (
          <button
            onClick={handleRevokeAllSessions}
            disabled={revokingAll}
            className="px-4 py-2 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            {revokingAll ? 'Revoking...' : 'Revoke All'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sessions.length > 0 ? (
        <div className="space-y-3">
          <AnimatePresence>
            {sessions.map((session, index) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 group hover:bg-slate-800/50 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-xl flex items-center justify-center text-amber-400">
                      {getSessionIcon(session.clientName)}
                    </div>
                    <div>
                      <p className="font-medium text-white flex items-center gap-2">
                        {session.clientName || 'Unknown Application'}
                        {isExpiringSoon(session.expiresAt) && (
                          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Expiring soon
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-3 text-sm text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Created {formatDate(session.createdAt)}
                        </span>
                        <span className="text-slate-500">
                          Expires {formatDate(session.expiresAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevokeSession(session.id)}
                    disabled={deletingId === session.id}
                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition opacity-0 group-hover:opacity-100"
                  >
                    {deletingId === session.id ? (
                      <div className="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-slate-800/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Monitor className="w-8 h-8 text-slate-600" />
          </div>
          <p className="text-slate-400 mb-2">No active sessions</p>
          <p className="text-sm text-slate-500">
            You'll see your active login sessions from connected applications here
          </p>
        </div>
      )}

      {/* Security tip */}
      <div className="mt-6 p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-amber-300 font-medium mb-1">Security Tip</p>
            <p className="text-amber-400/70">
              Regularly review your active sessions and revoke any that you don't recognize.
              This helps keep your account secure.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}



