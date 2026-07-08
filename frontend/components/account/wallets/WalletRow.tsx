'use client'

import { motion } from 'framer-motion'
import { Trash2, ExternalLink, Copy, Check } from 'lucide-react'
import { getChainIcon, getChainColor, formatAddress, getExplorerUrl } from './chains'

interface WalletRowProps {
  wallet: any
  index: number
  copiedAddress: string | null
  deletingId: string | null
  copyAddress: (address: string) => void
  handleUnlinkWallet: (walletId: string) => void
}

export default function WalletRow({
  wallet,
  index,
  copiedAddress,
  deletingId,
  copyAddress,
  handleUnlinkWallet,
}: WalletRowProps) {
  return (
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
  )
}
