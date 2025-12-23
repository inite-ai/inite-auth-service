'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Trash2, Download, FileDown } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'

interface DangerZoneSectionProps {
  user: any
  accessToken: string
  onDeleteAccount: () => void
}

export default function DangerZoneSection({ user, accessToken, onDeleteAccount }: DangerZoneSectionProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleExportData = async () => {
    setExporting(true)
    try {
      const { data } = await api.get('/identity/export', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      
      // Download as JSON
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inite-data-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      toast.success('Data exported successfully')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to export data')
    } finally {
      setExporting(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      toast.error('Please type DELETE to confirm')
      return
    }

    setLoading(true)
    try {
      await api.delete('/identity/account', {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { password },
      })
      toast.success('Account deleted successfully')
      onDeleteAccount()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-gradient-to-br from-red-950/30 to-slate-900 rounded-2xl p-8 border border-red-900/30 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Danger Zone</h2>
            <p className="text-sm text-slate-400">Irreversible actions</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Export Data */}
          <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
            <div className="flex items-center gap-3">
              <FileDown className="w-5 h-5 text-blue-400" />
              <div>
                <p className="font-medium text-white">Export Your Data</p>
                <p className="text-sm text-slate-400">Download all your account data</p>
              </div>
            </div>
            <button
              onClick={handleExportData}
              disabled={exporting}
              className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-xl hover:bg-blue-500/30 transition flex items-center gap-2 text-sm disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>

          {/* Delete Account */}
          <div className="flex items-center justify-between p-4 bg-red-950/30 rounded-xl border border-red-900/30">
            <div className="flex items-center gap-3">
              <Trash2 className="w-5 h-5 text-red-400" />
              <div>
                <p className="font-medium text-white">Delete Account</p>
                <p className="text-sm text-red-400/70">
                  Permanently delete your account and all data
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-4 py-2 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition flex items-center gap-2 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowDeleteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 rounded-2xl p-8 max-w-md w-full border border-red-900/50"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Delete Account?</h3>
                <p className="text-slate-400">
                  This action is <span className="text-red-400 font-semibold">permanent</span> and cannot be undone.
                  All your data will be deleted.
                </p>
              </div>

              <div className="space-y-4 mb-6">
                <div className="p-4 bg-red-950/30 rounded-xl border border-red-900/30">
                  <p className="text-sm text-red-400 mb-2">What will be deleted:</p>
                  <ul className="text-sm text-red-300/70 space-y-1">
                    <li>• Your profile and identity (DID)</li>
                    <li>• All linked wallets</li>
                    <li>• All passkeys</li>
                    <li>• All active sessions</li>
                    <li>• All issued credentials</li>
                  </ul>
                </div>

                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white"
                />

                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Type <span className="text-red-400 font-mono">DELETE</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    placeholder="DELETE"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={loading || deleteConfirmation !== 'DELETE'}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Deleting...' : 'Delete Forever'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

