'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, Plus, Trash2, ExternalLink, Copy, Check } from 'lucide-react'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import api from '@/lib/api'

interface WalletsSectionProps {
  wallets: any[]
  userDid: string
  accessToken: string
  onUpdate: () => void
}

export default function WalletsSection({ wallets, userDid, accessToken, onUpdate }: WalletsSectionProps) {
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  const handleLinkWallet = async () => {
    setLoading(true)
    try {
      if (!window.ethereum) {
        toast.error('MetaMask or compatible wallet not found')
        return
      }

      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const address = await signer.getAddress()

      // Get SIWE message
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
      onUpdate()
    } catch (error: any) {
      console.error('Link wallet error:', error)
      if (error.code === 4001) {
        toast.error('Wallet connection was cancelled')
      } else {
        toast.error(error.response?.data?.message || 'Failed to link wallet')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleUnlinkWallet = async (walletId: string) => {
    setDeletingId(walletId)
    try {
      await api.delete(`/identity/wallet/${walletId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      toast.success('Wallet unlinked')
      onUpdate()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to unlink wallet')
    } finally {
      setDeletingId(null)
    }
  }

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    toast.success('Address copied')
    setTimeout(() => setCopiedAddress(null), 2000)
  }

  const getChainIcon = (chain: string) => {
    switch (chain.toLowerCase()) {
      case 'ethereum':
        return (
          <svg className="w-5 h-5" viewBox="0 0 256 417" fill="currentColor">
            <path d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z" opacity="0.6"/>
            <path d="M127.962 0L0 212.32l127.962 75.639V154.158z"/>
            <path d="M127.961 312.187l-1.575 1.92v98.199l1.575 4.601L256 236.587z" opacity="0.6"/>
            <path d="M127.962 416.905v-104.72L0 236.585z"/>
          </svg>
        )
      case 'polygon':
        return (
          <svg className="w-5 h-5" viewBox="0 0 178 178" fill="currentColor">
            <path d="M133.6,60.9L94.4,38.1c-5.1-3-11.4-3-16.5,0L38.7,60.9c-5.1,3-8.2,8.5-8.2,14.4v45.5c0,5.9,3.1,11.4,8.2,14.4l39.2,22.8c5.1,3,11.4,3,16.5,0l39.2-22.8c5.1-3,8.2-8.5,8.2-14.4V75.3C141.8,69.4,138.6,63.9,133.6,60.9z"/>
          </svg>
        )
      case 'ton':
        return (
          <svg className="w-5 h-5" viewBox="0 0 56 56" fill="currentColor">
            <path d="M28 56c15.464 0 28-12.536 28-28S43.464 0 28 0 0 12.536 0 28s12.536 28 28 28zm-7.8-32.8L28 13.4l7.8 9.8-7.8 19.6-7.8-19.6z"/>
          </svg>
        )
      default:
        return <Wallet className="w-5 h-5" />
    }
  }

  const getChainColor = (chain: string) => {
    switch (chain.toLowerCase()) {
      case 'ethereum':
        return 'from-blue-500/20 to-indigo-500/20 text-blue-400'
      case 'polygon':
        return 'from-purple-500/20 to-violet-500/20 text-purple-400'
      case 'ton':
        return 'from-cyan-500/20 to-blue-500/20 text-cyan-400'
      default:
        return 'from-slate-500/20 to-slate-600/20 text-slate-400'
    }
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const getExplorerUrl = (address: string, chain: string) => {
    switch (chain.toLowerCase()) {
      case 'ethereum':
        return `https://etherscan.io/address/${address}`
      case 'polygon':
        return `https://polygonscan.com/address/${address}`
      case 'ton':
        return `https://tonscan.org/address/${address}`
      default:
        return null
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border border-slate-700/50 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Linked Wallets</h2>
            <p className="text-sm text-slate-400">Connect your Web3 wallets</p>
          </div>
        </div>
        <button
          onClick={handleLinkWallet}
          disabled={loading}
          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 transition flex items-center gap-2 text-sm disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {loading ? 'Connecting...' : 'Link Wallet'}
        </button>
      </div>

      {wallets.length > 0 ? (
        <div className="space-y-3">
          <AnimatePresence>
            {wallets.map((wallet, index) => (
              <motion.div
                key={wallet.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 group hover:bg-slate-800/50 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 bg-gradient-to-br ${getChainColor(wallet.chain)} rounded-xl flex items-center justify-center`}>
                      {getChainIcon(wallet.chain)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-white text-sm">
                          {formatAddress(wallet.address)}
                        </p>
                        <button
                          onClick={() => copyAddress(wallet.address)}
                          className="p-1 text-slate-500 hover:text-slate-300 transition"
                        >
                          {copiedAddress === wallet.address ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        {getExplorerUrl(wallet.address, wallet.chain) && (
                          <a
                            href={getExplorerUrl(wallet.address, wallet.chain)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-slate-500 hover:text-slate-300 transition"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-slate-400 capitalize">{wallet.chain}</span>
                        <span className="text-slate-500">
                          Linked {new Date(wallet.linkedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnlinkWallet(wallet.id)}
                    disabled={deletingId === wallet.id}
                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition opacity-0 group-hover:opacity-100"
                  >
                    {deletingId === wallet.id ? (
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
            <Wallet className="w-8 h-8 text-slate-600" />
          </div>
          <p className="text-slate-400 mb-2">No wallets linked</p>
          <p className="text-sm text-slate-500">
            Link your Ethereum, Polygon, or TON wallet to enable Web3 features
          </p>
        </div>
      )}

      {/* Supported chains */}
      <div className="mt-6 pt-6 border-t border-slate-700/50">
        <p className="text-xs text-slate-500 mb-3">Supported Chains</p>
        <div className="flex gap-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 rounded-lg">
            {getChainIcon('ethereum')}
            <span className="text-sm text-blue-400">Ethereum</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 rounded-lg">
            {getChainIcon('polygon')}
            <span className="text-sm text-purple-400">Polygon</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-cyan-500/10 rounded-lg">
            {getChainIcon('ton')}
            <span className="text-sm text-cyan-400">TON</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

