'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Key, Smartphone, Eye, EyeOff, Check, AlertTriangle, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'

interface SecuritySectionProps {
  securityStatus: {
    hasPassword: boolean
    twoFactorEnabled: boolean
    passkeysCount: number
    walletsCount: number
    emailVerified: boolean
  }
  accessToken: string
  onUpdate: () => void
}

export default function SecuritySection({ securityStatus, accessToken, onUpdate }: SecuritySectionProps) {
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [show2FASetup, setShow2FASetup] = useState(false)
  const [show2FADisable, setShow2FADisable] = useState(false)
  const [loading, setLoading] = useState(false)
  
  // Password form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  
  // 2FA
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [disableCode, setDisableCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/identity/change-password', {
        currentPassword,
        newPassword,
      }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      toast.success('Password changed successfully')
      setShowPasswordForm(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onUpdate()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  const handleSetup2FA = async () => {
    setLoading(true)
    try {
      const { data } = await api.post('/auth/identity/2fa/setup', {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      setQrCode(data.qrCode)
      setSecret(data.secret)
      setShow2FASetup(true)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to setup 2FA')
    } finally {
      setLoading(false)
    }
  }

  const handleEnable2FA = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      toast.error('Please enter a valid 6-digit code')
      return
    }

    setLoading(true)
    try {
      const { data } = await api.post('/auth/identity/2fa/enable', {
        code: verificationCode,
      }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      setBackupCodes(data.backupCodes)
      toast.success('2FA enabled successfully!')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  const handleDisable2FA = async () => {
    if (!disableCode || disableCode.length !== 6) {
      toast.error('Please enter a valid 6-digit code')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/identity/2fa/disable', {
        code: disableCode,
        password: disablePassword,
      }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      toast.success('2FA disabled successfully')
      setShow2FADisable(false)
      setDisableCode('')
      setDisablePassword('')
      onUpdate()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to disable 2FA')
    } finally {
      setLoading(false)
    }
  }

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'))
    toast.success('Backup codes copied to clipboard')
  }

  const closeBackupCodesModal = () => {
    setBackupCodes([])
    setShow2FASetup(false)
    setVerificationCode('')
    setSecret('')
    setQrCode('')
    onUpdate()
  }

  const securityScore = (() => {
    let score = 0
    if (securityStatus.hasPassword) score += 20
    if (securityStatus.twoFactorEnabled) score += 30
    if (securityStatus.passkeysCount > 0) score += 25
    if (securityStatus.walletsCount > 0) score += 15
    if (securityStatus.emailVerified) score += 10
    return score
  })()

  const getScoreColor = () => {
    if (securityScore >= 80) return 'from-emerald-500 to-green-500'
    if (securityScore >= 50) return 'from-amber-500 to-yellow-500'
    return 'from-red-500 to-orange-500'
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border border-slate-700/50 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Security</h2>
        </div>

        {/* Security Score */}
        <div className="mb-8 p-4 bg-slate-800/50 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-400">Security Score</span>
            <span className={`text-2xl font-bold bg-gradient-to-r ${getScoreColor()} bg-clip-text text-transparent`}>
              {securityScore}%
            </span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${securityScore}%` }}
              transition={{ duration: 1, delay: 0.5 }}
              className={`h-full bg-gradient-to-r ${getScoreColor()} rounded-full`}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {securityStatus.emailVerified && (
              <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-lg flex items-center gap-1">
                <Check className="w-3 h-3" /> Email verified
              </span>
            )}
            {securityStatus.hasPassword && (
              <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-lg flex items-center gap-1">
                <Check className="w-3 h-3" /> Password set
              </span>
            )}
            {securityStatus.twoFactorEnabled && (
              <span className="px-2 py-1 bg-violet-500/20 text-violet-400 text-xs rounded-lg flex items-center gap-1">
                <Check className="w-3 h-3" /> 2FA enabled
              </span>
            )}
            {securityStatus.passkeysCount > 0 && (
              <span className="px-2 py-1 bg-fuchsia-500/20 text-fuchsia-400 text-xs rounded-lg flex items-center gap-1">
                <Check className="w-3 h-3" /> {securityStatus.passkeysCount} passkey(s)
              </span>
            )}
          </div>
        </div>

        {/* Password Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
            <div className="flex items-center gap-3">
              <Key className="w-5 h-5 text-blue-400" />
              <div>
                <p className="font-medium text-white">Password</p>
                <p className="text-sm text-slate-400">
                  {securityStatus.hasPassword ? 'Password is set' : 'No password set'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowPasswordForm(!showPasswordForm)}
              className="px-4 py-2 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition text-sm"
            >
              {securityStatus.hasPassword ? 'Change' : 'Set Password'}
            </button>
          </div>

          <AnimatePresence>
            {showPasswordForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 bg-slate-800/50 rounded-xl space-y-4">
                  {securityStatus.hasPassword && (
                    <div className="relative">
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Current Password"
                        className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white pr-12"
                      />
                      <button
                        onClick={() => setShowPasswords(!showPasswords)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                      >
                        {showPasswords ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  )}
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New Password (min 8 characters)"
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white"
                  />
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm New Password"
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowPasswordForm(false)}
                      className="flex-1 px-4 py-3 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleChangePassword}
                      disabled={loading}
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:from-blue-600 hover:to-cyan-600 transition disabled:opacity-50"
                    >
                      {loading ? 'Saving...' : 'Save Password'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 2FA Section */}
          <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-violet-400" />
              <div>
                <p className="font-medium text-white">Two-Factor Authentication</p>
                <p className="text-sm text-slate-400">
                  {securityStatus.twoFactorEnabled 
                    ? 'Authenticator app enabled' 
                    : 'Add extra security to your account'}
                </p>
              </div>
            </div>
            {securityStatus.twoFactorEnabled ? (
              <button
                onClick={() => setShow2FADisable(true)}
                className="px-4 py-2 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition text-sm"
              >
                Disable
              </button>
            ) : (
              <button
                onClick={handleSetup2FA}
                disabled={loading}
                className="px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl hover:from-violet-600 hover:to-fuchsia-600 transition text-sm disabled:opacity-50"
              >
                {loading ? 'Setting up...' : 'Enable'}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* 2FA Setup Modal */}
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

      {/* 2FA Disable Modal */}
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
    </>
  )
}



