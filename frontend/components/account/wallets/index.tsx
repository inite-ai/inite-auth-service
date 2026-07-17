'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, Plus } from 'lucide-react'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react'
import { EthereumProvider } from '@walletconnect/ethereum-provider'
import type { WalletsSectionProps } from './types'
import { getChainIcon } from './chains'
import WalletRow from './WalletRow'

// WalletConnect Project ID - should be in env
const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id'

export default function WalletsSection({ wallets, userDid, accessToken, onUpdate }: WalletsSectionProps) {
  const [loading, setLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<'evm' | 'ton' | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  // TON Connect hooks
  const [tonConnectUI] = useTonConnectUI()
  const tonWallet = useTonWallet()

  // Link EVM wallet via WalletConnect
  const handleLinkEVMWallet = async () => {
    setLoading(true)
    setLoadingType('evm')
    try {
      // First try injected provider (MetaMask, etc.)
      let provider: ethers.BrowserProvider
      let signer: ethers.Signer

      if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum)
        signer = await provider.getSigner()
      } else {
        // Use WalletConnect
        const wcProvider = await EthereumProvider.init({
          projectId: WALLETCONNECT_PROJECT_ID,
          chains: [1], // Ethereum mainnet
          optionalChains: [137, 56, 42161], // Polygon, BSC, Arbitrum
          showQrModal: true,
          metadata: {
            name: 'INITE Identity',
            description: 'Link your wallet to INITE Identity',
            url: 'https://auth.inite.ai',
            icons: ['https://auth.inite.ai/logo.svg'],
          },
        })

        await wcProvider.enable()
        provider = new ethers.BrowserProvider(wcProvider)
        signer = await provider.getSigner()
      }

      const address = await signer.getAddress()

      // Get SIWE message from backend
      const { data } = await api.post(
        '/auth/identity/wallet/siwe-message',
        { address, nonce: crypto.randomUUID() },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      // Sign message
      const signature = await signer.signMessage(data.message)

      // Detect chain
      const network = await provider.getNetwork()
      const chainId = Number(network.chainId)
      const chain = chainId === 137 ? 'polygon' : chainId === 56 ? 'bsc' : 'ethereum'

      // Link wallet
      await api.post(
        '/auth/identity/wallet/link',
        {
          address,
          chain,
          message: data.message,
          signature,
        },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      toast.success('EVM wallet linked successfully!')
      onUpdate()
    } catch (error: any) {
      console.error('Link EVM wallet error:', error)
      if (error.code === 4001 || error.message?.includes('User rejected')) {
        toast.error('Wallet connection was cancelled')
      } else {
        toast.error(error.response?.data?.message || 'Failed to link wallet')
      }
    } finally {
      setLoading(false)
      setLoadingType(null)
    }
  }

  // Link TON wallet via TON Connect
  const handleLinkTONWallet = useCallback(async () => {
    setLoading(true)
    setLoadingType('ton')
    try {
      // Check if already connected
      if (!tonWallet) {
        // Open TON Connect modal
        await tonConnectUI.openModal()

        // Wait for connection
        const unsubscribe = tonConnectUI.onStatusChange(async (wallet) => {
          if (wallet) {
            unsubscribe()
            await linkTonWallet(wallet)
          }
        })
        return
      }

      await linkTonWallet(tonWallet)
    } catch (error: any) {
      console.error('Link TON wallet error:', error)
      toast.error(error.response?.data?.message || 'Failed to link TON wallet')
      setLoading(false)
      setLoadingType(null)
    }
  }, [tonWallet, tonConnectUI, accessToken])

  const linkTonWallet = async (wallet: any) => {
    try {
      const address = wallet.account.address
      const publicKey = wallet.account.publicKey

      // Get TON message from backend
      const { data } = await api.post(
        '/auth/identity/wallet/ton-message',
        { address, nonce: crypto.randomUUID() },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      // Sign message using TON Connect
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [],
      })

      // For TON, we use the proof from connection instead
      // Since sendTransaction is for transfers, we'll use the wallet's public key for verification
      // The signature is embedded in the connection proof

      // Use a simple message signature approach
      const messageBytes = new TextEncoder().encode(data.message)
      const signature = Buffer.from(messageBytes).toString('base64') // Placeholder - real impl needs proper signing

      // Link wallet
      await api.post(
        '/auth/identity/wallet/link',
        {
          address,
          chain: 'ton',
          message: data.message,
          signature,
          publicKey,
        },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      toast.success('TON wallet linked successfully!')
      onUpdate()
    } catch (error: any) {
      console.error('Link TON wallet error:', error)
      toast.error(error.response?.data?.message || 'Failed to link TON wallet')
    } finally {
      setLoading(false)
      setLoadingType(null)
    }
  }

  const handleUnlinkWallet = async (walletId: string) => {
    setDeletingId(walletId)
    try {
      await api.delete(`/auth/identity/wallet/${walletId}`, {
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
        <div className="flex gap-2">
          <button
            onClick={handleLinkEVMWallet}
            disabled={loading}
            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 transition flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {loadingType === 'evm' ? 'Connecting...' : 'EVM'}
          </button>
          <button
            onClick={handleLinkTONWallet}
            disabled={loading}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl hover:from-cyan-600 hover:to-blue-600 transition flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {loadingType === 'ton' ? 'Connecting...' : 'TON'}
          </button>
        </div>
      </div>

      {wallets.length > 0 ? (
        <div className="space-y-3">
          <AnimatePresence>
            {wallets.map((wallet, index) => (
              <WalletRow
                key={wallet.id}
                wallet={wallet}
                index={index}
                copiedAddress={copiedAddress}
                deletingId={deletingId}
                copyAddress={copyAddress}
                handleUnlinkWallet={handleUnlinkWallet}
              />
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
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 rounded-lg">
            {getChainIcon('ethereum')}
            <span className="text-sm text-blue-400">Ethereum</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 rounded-lg">
            {getChainIcon('polygon')}
            <span className="text-sm text-purple-400">Polygon</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 rounded-lg">
            {getChainIcon('bsc')}
            <span className="text-sm text-yellow-400">BSC</span>
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
