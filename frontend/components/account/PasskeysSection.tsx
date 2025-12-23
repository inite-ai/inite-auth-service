'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Fingerprint, Plus, Trash2, Shield, Smartphone, Laptop, HelpCircle } from 'lucide-react'
import { startRegistration } from '@simplewebauthn/browser'
import toast from 'react-hot-toast'
import api from '@/lib/api'

interface PasskeysSectionProps {
  passkeys: any[]
  accessToken: string
  onUpdate: () => void
}

export default function PasskeysSection({ passkeys, accessToken, onUpdate }: PasskeysSectionProps) {
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleAddPasskey = async () => {
    setLoading(true)
    try {
      // Get registration options
      const { data: options } = await api.post(
        '/auth/passkey/registration/options',
        {},
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      // Start WebAuthn registration
      const response = await startRegistration(options)

      // Verify registration
      await api.post(
        '/auth/passkey/registration/verify',
        {
          response,
          challenge: options.challenge,
        },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      toast.success('Passkey registered successfully!')
      onUpdate()
    } catch (error: any) {
      console.error('Passkey registration error:', error)
      if (error.name === 'NotAllowedError') {
        toast.error('Passkey registration was cancelled')
      } else {
        toast.error(error.response?.data?.message || 'Failed to register passkey')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePasskey = async (passkeyId: string) => {
    setDeletingId(passkeyId)
    try {
      await api.post(
        '/auth/passkey/delete',
        { passkeyId },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      toast.success('Passkey deleted')
      onUpdate()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete passkey')
    } finally {
      setDeletingId(null)
    }
  }

  const getDeviceIcon = (deviceType?: string) => {
    if (deviceType?.toLowerCase().includes('mobile') || deviceType?.toLowerCase().includes('phone')) {
      return <Smartphone className="w-5 h-5" />
    }
    if (deviceType?.toLowerCase().includes('laptop') || deviceType?.toLowerCase().includes('desktop')) {
      return <Laptop className="w-5 h-5" />
    }
    return <Fingerprint className="w-5 h-5" />
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border border-slate-700/50 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center">
            <Fingerprint className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Passkeys</h2>
            <p className="text-sm text-slate-400">Secure passwordless authentication</p>
          </div>
        </div>
        <button
          onClick={handleAddPasskey}
          disabled={loading}
          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 transition flex items-center gap-2 text-sm disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {loading ? 'Adding...' : 'Add Passkey'}
        </button>
      </div>

      {passkeys.length > 0 ? (
        <div className="space-y-3">
          <AnimatePresence>
            {passkeys.map((passkey, index) => (
              <motion.div
                key={passkey.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 flex items-center justify-between group hover:bg-slate-800/50 transition"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-xl flex items-center justify-center text-blue-400">
                    {getDeviceIcon(passkey.deviceType)}
                  </div>
                  <div>
                    <p className="font-medium text-white flex items-center gap-2">
                      {passkey.deviceName || 'Unnamed Passkey'}
                      <Shield className="w-4 h-4 text-emerald-400" />
                    </p>
                    <div className="flex items-center gap-3 text-sm text-slate-400">
                      <span>
                        Added {new Date(passkey.createdAt).toLocaleDateString()}
                      </span>
                      {passkey.lastUsedAt && (
                        <span className="text-slate-500">
                          • Last used {new Date(passkey.lastUsedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDeletePasskey(passkey.id)}
                  disabled={deletingId === passkey.id}
                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition opacity-0 group-hover:opacity-100"
                >
                  {deletingId === passkey.id ? (
                    <div className="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="w-5 h-5" />
                  )}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-slate-800/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Fingerprint className="w-8 h-8 text-slate-600" />
          </div>
          <p className="text-slate-400 mb-2">No passkeys registered</p>
          <p className="text-sm text-slate-500">
            Passkeys provide secure, passwordless authentication using your device's biometrics
          </p>
        </div>
      )}

      {/* Info box */}
      <div className="mt-6 p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
        <div className="flex items-start gap-3">
          <HelpCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-blue-300 font-medium mb-1">What are Passkeys?</p>
            <p className="text-blue-400/70">
              Passkeys are a modern, phishing-resistant replacement for passwords. They use your device's 
              built-in security (Face ID, Touch ID, Windows Hello) to securely authenticate you.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

