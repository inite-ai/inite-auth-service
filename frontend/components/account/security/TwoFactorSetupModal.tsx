'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Check, Copy } from 'lucide-react'

interface TwoFactorSetupModalProps {
  show2FASetup: boolean
  setShow2FASetup: (value: boolean) => void
  qrCode: string
  secret: string
  verificationCode: string
  setVerificationCode: (value: string) => void
  backupCodes: string[]
  loading: boolean
  handleEnable2FA: () => void
  copyBackupCodes: () => void
  closeBackupCodesModal: () => void
}

export default function TwoFactorSetupModal({
  show2FASetup,
  setShow2FASetup,
  qrCode,
  secret,
  verificationCode,
  setVerificationCode,
  backupCodes,
  loading,
  handleEnable2FA,
  copyBackupCodes,
  closeBackupCodesModal,
}: TwoFactorSetupModalProps) {
  return (
    <AnimatePresence>
      {show2FASetup && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => !backupCodes.length && setShow2FASetup(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 rounded-2xl p-8 max-w-md w-full border border-slate-700"
          >
            {backupCodes.length > 0 ? (
              <>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-green-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">2FA Enabled!</h3>
                  <p className="text-slate-400">Save these backup codes in a safe place</p>
                </div>
                <div className="bg-slate-800 rounded-xl p-4 mb-6">
                  <div className="grid grid-cols-2 gap-2">
                    {backupCodes.map((code, i) => (
                      <code key={i} className="text-center py-2 bg-slate-700/50 rounded-lg text-emerald-400 font-mono text-sm">
                        {code}
                      </code>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={copyBackupCodes}
                    className="flex-1 px-4 py-3 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition flex items-center justify-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Copy
                  </button>
                  <button
                    onClick={closeBackupCodesModal}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-xl hover:from-emerald-600 hover:to-green-600 transition"
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-white mb-2">Setup Two-Factor Auth</h3>
                  <p className="text-slate-400">Scan the QR code with your authenticator app</p>
                </div>
                {qrCode && (
                  <div className="bg-white rounded-xl p-4 mx-auto w-fit mb-4">
                    <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
                  </div>
                )}
                <div className="bg-slate-800 rounded-xl p-4 mb-6">
                  <p className="text-xs text-slate-400 mb-2">Or enter this code manually:</p>
                  <code className="text-emerald-400 font-mono text-sm break-all">{secret}</code>
                </div>
                <div className="space-y-4">
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white text-center text-xl tracking-widest font-mono"
                  />
                  <button
                    onClick={handleEnable2FA}
                    disabled={loading || verificationCode.length !== 6}
                    className="w-full px-4 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl hover:from-violet-600 hover:to-fuchsia-600 transition disabled:opacity-50"
                  >
                    {loading ? 'Verifying...' : 'Verify & Enable'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
