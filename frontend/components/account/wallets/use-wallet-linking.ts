'use client'

import { useState, useCallback } from 'react'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react'
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
 * NOTE — TON linking is known-broken upstream of this hook: the flow signs
 * nothing and posts `base64(message)` where the API expects a detached
 * Ed25519 signature, which IdentityService.verifyTonSignature always
 * rejects. It fails closed (no wallet is linked), so this preserves the
 * existing behaviour rather than papering over it, and reports the failure
 * plainly instead of as a generic error. Fixing it properly means requesting
 * `ton_proof` at connect time and verifying it server-side per the TON
 * Connect spec — tracked separately.
 */
export function useWalletLinking(accessToken: string, onUpdate: () => void) {
  const t = useT()
  const [pending, setPending] = useState<LinkKind | null>(null)
  const [tonConnectUI] = useTonConnectUI()
  const tonWallet = useTonWallet()

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
      if (!tonWallet) {
        await tonConnectUI.openModal()
        return
      }
      const { address, publicKey } = tonWallet.account
      const { data } = await api.post(
        '/auth/identity/wallet/ton-message',
        { address, nonce: crypto.randomUUID() },
        auth,
      )
      // The wallet never signs `data.message`; the API rejects what we send.
      // See the note on this hook.
      await api.post(
        '/auth/identity/wallet/link',
        { address, chain: 'ton', message: data.message, signature: '', publicKey },
        auth,
      )
      toast.success(t('account.wallets.linked'))
      onUpdate()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('error.network'))
    } finally {
      setPending(null)
    }
  }, [tonWallet, tonConnectUI, accessToken, onUpdate, t])

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
