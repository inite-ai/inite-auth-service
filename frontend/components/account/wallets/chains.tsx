import { Wallet } from 'lucide-react'

export const getChainIcon = (chain: string) => {
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
    case 'bsc':
      return (
        <svg className="w-5 h-5" viewBox="0 0 126 126" fill="currentColor">
          <path d="M63 0L38.5 24.5 63 49l24.5-24.5L63 0zM25 38.5L0 63l25 24.5L49.5 63 25 38.5zm76 0L76.5 63 101 87.5 126 63l-25-24.5zM63 76.5L38.5 101 63 126l24.5-25L63 76.5z"/>
        </svg>
      )
    default:
      return <Wallet className="w-5 h-5" />
  }
}

export const getChainColor = (chain: string) => {
  switch (chain.toLowerCase()) {
    case 'ethereum':
      return 'from-blue-500/20 to-indigo-500/20 text-blue-400'
    case 'polygon':
      return 'from-purple-500/20 to-violet-500/20 text-purple-400'
    case 'ton':
      return 'from-cyan-500/20 to-blue-500/20 text-cyan-400'
    case 'bsc':
      return 'from-yellow-500/20 to-orange-500/20 text-yellow-400'
    default:
      return 'from-slate-500/20 to-slate-600/20 text-slate-400'
  }
}

export const formatAddress = (address: string) => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export const getExplorerUrl = (address: string, chain: string) => {
  switch (chain.toLowerCase()) {
    case 'ethereum':
      return `https://etherscan.io/address/${address}`
    case 'polygon':
      return `https://polygonscan.com/address/${address}`
    case 'ton':
      return `https://tonscan.org/address/${address}`
    case 'bsc':
      return `https://bscscan.com/address/${address}`
    default:
      return null
  }
}
