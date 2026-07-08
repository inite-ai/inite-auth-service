'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'

interface TwoFactorDisableModalProps {
  show2FADisable: boolean
  setShow2FADisable: (value: boolean) => void
  disablePassword: string
  setDisablePassword: (value: string) => void
  disableCode: string
  setDisableCode: (value: string) => void
  loading: boolean
  handleDisable2FA: () => void
}

export default function TwoFactorDisableModal({
  show2FADisable,
  setShow2FADisable,
  disablePassword,
  setDisablePassword,
  disableCode,
  setDisableCode,
  loading,
  handleDisable2FA,
}: TwoFactorDisableModalProps) {
  return (
    <AnimatePresence>
      {show2FADisable && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShow2FADisable(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 rounded-2xl p-8 max-w-md w-full border border-slate-700"
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Disable 2FA?</h3>
              <p className="text-slate-400">This will remove the extra security layer from your account</p>
            </div>
            <div className="space-y-4">
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Your password"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white"
              />
              <input
                type="text"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="2FA Code"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white text-center text-xl tracking-widest font-mono"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShow2FADisable(false)}
                  className="flex-1 px-4 py-3 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisable2FA}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-xl hover:from-red-600 hover:to-orange-600 transition disabled:opacity-50"
                >
                  {loading ? 'Disabling...' : 'Disable 2FA'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
