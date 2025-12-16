'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { User, Wallet, Fingerprint, LogOut, Shield, Link as LinkIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { ethers } from 'ethers'

export default function AccountPage() {
  const [user, setUser] = useState<any>(null)
  const [wallets, setWallets] = useState<any[]>([])
  const [passkeys, setPasskeys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const loadUserData = useCallback(async () => {
    try {
      const accessToken = localStorage.getItem('access_token')
      if (!accessToken) {
        router.push('/login')
        return
      }

      const config = { headers: { Authorization: `Bearer ${accessToken}` } }

      const [userRes, walletsRes, passkeysRes] = await Promise.all([
        api.get('/identity/me', config),
        api.get('/identity/wallets', config),
        api.get('/auth/passkey/list', config),
      ])

      setUser(userRes.data)
      setWallets(walletsRes.data)
      setPasskeys(passkeysRes.data)
    } catch (error) {
      console.error('Load user data error:', error)
      toast.error('Failed to load account data')
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadUserData()
  }, [loadUserData])

  const handleLinkWallet = async () => {
    try {
      if (!window.ethereum) {
        toast.error('MetaMask not found')
        return
      }

      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const address = await signer.getAddress()

      // Get SIWE message
      const accessToken = localStorage.getItem('access_token')
      const { data } = await api.post(
        '/identity/wallet/siwe-message',
        { address, nonce: crypto.randomUUID() },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      // Sign message
      const signature = await signer.signMessage(data.message)

      // Link wallet
      await api.post(
        '/identity/wallet/link',
        {
          address,
          chain: 'ethereum',
          message: data.message,
          signature,
        },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      toast.success('Wallet linked successfully!')
      loadUserData()
    } catch (error: any) {
      console.error('Link wallet error:', error)
      toast.error(error.response?.data?.message || 'Failed to link wallet')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    router.push('/login')
    toast.success('Logged out successfully')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-4xl mx-auto py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {user?.name || 'User'}
                </h1>
                <p className="text-gray-600 dark:text-gray-400">{user?.email}</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  DID: {user?.did?.substring(0, 20)}...
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </motion.div>

        {/* Passkeys */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center gap-3 mb-4">
            <Fingerprint className="w-6 h-6 text-blue-500" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Passkeys</h2>
          </div>
          {passkeys.length > 0 ? (
            <div className="space-y-2">
              {passkeys.map((passkey) => (
                <div
                  key={passkey.id}
                  className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {passkey.deviceName || 'Unnamed Device'}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Added {new Date(passkey.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Shield className="w-5 h-5 text-green-500" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 dark:text-gray-400">No passkeys registered</p>
          )}
        </motion.div>

        {/* Wallets */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Wallet className="w-6 h-6 text-purple-500" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Linked Wallets
              </h2>
            </div>
            <button
              onClick={handleLinkWallet}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition flex items-center gap-2"
            >
              <LinkIcon className="w-4 h-4" />
              Link Wallet
            </button>
          </div>
          {wallets.length > 0 ? (
            <div className="space-y-2">
              {wallets.map((wallet) => (
                <div
                  key={wallet.id}
                  className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm text-gray-900 dark:text-white">
                        {wallet.address}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {wallet.chain.toUpperCase()} • Linked{' '}
                        {new Date(wallet.linkedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Shield className="w-5 h-5 text-green-500" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 dark:text-gray-400">
              No wallets linked. Link a wallet to enable Web3 features.
            </p>
          )}
        </motion.div>
      </div>
    </div>
  )
}

