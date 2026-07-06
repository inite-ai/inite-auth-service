'use client'

import { useState } from 'react'
import { Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { authStorage } from '@/lib/authStorage'
import { OAuthParams, isOAuthFlow, buildConsentUrl } from '@/lib/oauthHelpers'
import { Button, Card, CardHeader } from '@/components/ui'

interface WalletAuthProps {
  oauthParams: OAuthParams
}

/** Minimal EIP-1193 surface — we only need request(). */
interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<any>
}

function getProvider(): EthereumProvider | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as any).ethereum as EthereumProvider | undefined
}

/**
 * Sign-In With Ethereum (EIP-4361) login. One tap: connect the wallet, fetch a
 * server-issued challenge, personal_sign it, then verify. On success the server
 * establishes the first-party session and returns an access token (same shape
 * as the other methods), so we save it and continue the OAuth flow / account.
 */
export default function WalletAuth({ oauthParams }: WalletAuthProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const signIn = async () => {
    const provider = getProvider()
    if (!provider) return
    setLoading(true)
    try {
      const accounts: string[] = await provider.request({
        method: 'eth_requestAccounts',
      })
      const addr = accounts[0]
      const {
        data: { message },
      } = await api.post('/auth/wallet/siwe/challenge', { address: addr })
      const signature: string = await provider.request({
        method: 'personal_sign',
        params: [message, addr],
      })
      const { data } = await api.post('/auth/wallet/siwe/verify', {
        message,
        signature,
      })
      toast.success('Signed in')
      authStorage.save({
        accessToken: data.access_token,
        userId: data.user?.id,
      })
      if (isOAuthFlow(oauthParams)) {
        window.location.href = buildConsentUrl(oauthParams)
      } else {
        router.push('/account')
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          error?.message ||
          'Could not sign in with your wallet',
      )
    } finally {
      setLoading(false)
    }
  }

  if (!getProvider()) {
    return (
      <Card>
        <CardHeader
          icon={<Wallet className="w-8 h-8 text-white" />}
          iconClassName="from-amber-500 to-orange-600"
          title="No Ethereum wallet detected"
          description="Install a Web3 wallet (e.g. MetaMask) to sign in with Ethereum."
        />
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        icon={<Wallet className="w-8 h-8 text-white" />}
        iconClassName="from-amber-500 to-orange-600"
        title="Sign in with your wallet"
        description="Connect your Web3 wallet and sign a message — no password needed."
      />
      <Button
        type="button"
        loading={loading}
        onClick={signIn}
        icon={<Wallet className="w-5 h-5" />}
      >
        {loading ? 'Waiting for wallet…' : 'Connect wallet & sign'}
      </Button>
    </Card>
  )
}
