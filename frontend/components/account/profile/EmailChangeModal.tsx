'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Loader2 } from 'lucide-react'

interface EmailChangeModalProps {
  open: boolean
  onClose: () => void
  newEmail: string
  setNewEmail: (value: string) => void
  emailPassword: string
  setEmailPassword: (value: string) => void
  emailLoading: boolean
  onSubmit: () => void
}

export default function EmailChangeModal({
  open,
  onClose,
  newEmail,
  setNewEmail,
  emailPassword,
  setEmailPassword,
  emailLoading,
  onSubmit,
}: EmailChangeModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 rounded-2xl p-8 max-w-md w-full border border-slate-700"
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Change Email Address</h3>
              <p className="text-slate-400">A verification link will be sent to your new email</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">New Email Address</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new@email.com"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Confirm with Password</label>
                <input
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={onSubmit}
                  disabled={emailLoading}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl hover:from-violet-600 hover:to-fuchsia-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {emailLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Verification'
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
