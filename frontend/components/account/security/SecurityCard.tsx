'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Key, Smartphone, Eye, EyeOff, Check } from 'lucide-react'
import type { SecurityStatus } from './types'

interface SecurityCardProps {
  securityStatus: SecurityStatus
  securityScore: number
  getScoreColor: () => string
  loading: boolean
  showPasswordForm: boolean
  setShowPasswordForm: (value: boolean) => void
  currentPassword: string
  setCurrentPassword: (value: string) => void
  newPassword: string
  setNewPassword: (value: string) => void
  confirmPassword: string
  setConfirmPassword: (value: string) => void
  showPasswords: boolean
  setShowPasswords: (value: boolean) => void
  handleChangePassword: () => void
  handleSetup2FA: () => void
  setShow2FADisable: (value: boolean) => void
}

export default function SecurityCard({
  securityStatus,
  securityScore,
  getScoreColor,
  loading,
  showPasswordForm,
  setShowPasswordForm,
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  showPasswords,
  setShowPasswords,
  handleChangePassword,
  handleSetup2FA,
  setShow2FADisable,
}: SecurityCardProps) {
  return (
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
  )
}
