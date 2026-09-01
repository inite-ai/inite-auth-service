'use client'

import { useState, useCallback } from 'react'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import { useTonConnectUI } from '@tonconnect/ui-react'
import { EthereumProvider } from '@walletconnect/ethereum-provider'
import api from '@/lib/api'
import { useT } from '@/lib/i18n'

const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id'

/** EVM chain ids we can name; anything else links as generic ethereum. */
const CHAIN_BY_ID: Record<number, string> = { 137: 'polygon', 56: 'bsc' }

export type LinkKind = 'evm' | 'ton'

/**
 * Wallet link/unlink side effects, extracted from the section so the view
 * stays presentational.
 *
 * TON linking uses the real TON Connect `ton_proof`. The previous version
 * signed nothing and posted `base64(message)` where the API expects a
 * detached Ed25519 signature, so it could never succeed. A proof is only
 * issued at connect time, which is why an existing connection is dropped
 * first — reconnecting is the only way to ask for one.
 */
export function useWalletLinking(accessToken: string, onUpdate: () => void) {
  const t = useT()
  const [pending, setPending] = useState<LinkKind | null>(null)
  const [tonConnectUI] = useTonConnectUI()

  const auth = { headers: { Authorization: `Bearer ${accessToken}` } }

  const linkEvm = useCallback(async () => {
    setPending('evm')
    try {
      let provider: ethers.BrowserProvider

      if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum)
      } else {
        const wcProvider = await EthereumProvider.init({
          projectId: WALLETCONNECT_PROJECT_ID,
          chains: [1],
          optionalChains: [137, 56, 42161],
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
      }

      const signer = await provider.getSigner()
      const address = await signer.getAddress()

      const { data } = await api.post(
        '/auth/identity/wallet/siwe-message',
        { address, nonce: crypto.randomUUID() },
        auth,
      )
      const signature = await signer.signMessage(data.message)

      const network = await provider.getNetwork()
      const chain = CHAIN_BY_ID[Number(network.chainId)] ?? 'ethereum'

      await api.post(
        '/auth/identity/wallet/link',
        { address, chain, message: data.message, signature },
        auth,
      )

      toast.success(t('account.wallets.linked'))
      onUpdate()
    } catch (error: any) {
      if (error.code === 4001 || error.message?.includes('User rejected')) {
        toast.error(t('account.wallets.cancelled'))
      } else {
        toast.error(error.response?.data?.message || t('error.network'))
      }
    } finally {
      setPending(null)
    }
  }, [accessToken, onUpdate, t])

  const linkTon = useCallback(async () => {
    setPending('ton')
    try {
      // Server-issued, single-use: the wallet must sign a payload we minted,
      // so a proof captured anywhere else carries the wrong one.
      const { data } = await api.post('/auth/identity/wallet/ton/payload', {}, auth)

      // ton_proof only comes back with a fresh connect handshake.
      if (tonConnectUI.connected) await tonConnectUI.disconnect()
      tonConnectUI.setConnectRequestParameters({
        state: 'ready',
        value: { tonProof: data.payload },
      })

      const wallet = await tonConnectUI.connectWallet()
      const item = wallet.connectItems?.tonProof

      if (!item || !('proof' in item)) {
        toast.error(t('account.wallets.proofRefused'))
        return
      }

      await api.post(
        '/auth/identity/wallet/ton/link',
        {
          address: wallet.account.address,
          publicKey: wallet.account.publicKey,
          walletStateInit: wallet.account.walletStateInit,
          proof: item.proof,
        },
        auth,
      )
      toast.success(t('account.wallets.linked'))
      onUpdate()
    } catch (error: any) {
      // The UI rejects with a plain Error when the user closes the modal.
      if (/reject|cancel|abort/i.test(error?.message ?? '')) {
        toast.error(t('account.wallets.cancelled'))
      } else {
        toast.error(error.response?.data?.message || t('error.network'))
      }
    } finally {
      setPending(null)
      tonConnectUI.setConnectRequestParameters(null)
    }
  }, [tonConnectUI, accessToken, onUpdate, t])

  const unlink = useCallback(
    async (walletId: string) => {
      await api.delete(`/auth/identity/wallet/${walletId}`, auth)
      toast.success(t('account.wallets.unlinked'))
      onUpdate()
    },
    [accessToken, onUpdate, t],
  )

  return { pending, linkEvm, linkTon, unlink }
}
