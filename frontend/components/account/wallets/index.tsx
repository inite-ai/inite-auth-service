'use client'

import { useState } from 'react'
import { Wallet, Plus, Trash2, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { useT } from '@/lib/i18n'
import { Button, Card, CardHeader, Badge, ConfirmDialog, CopyButton } from '@/components/ui'
import { Row, EmptyState, formatRelativeDays } from '../shared'
import { getChainIcon, formatAddress, getExplorerUrl } from './chains'
import { useWalletLinking } from './use-wallet-linking'
import type { LinkedWallet } from '../types'

export default function WalletsSection({
  wallets,
  accessToken,
  onUpdate,
}: {
  wallets: LinkedWallet[]
  accessToken: string
  onUpdate: () => void
}) {
  const t = useT()
  const { pending, linkEvm, linkTon, unlink } = useWalletLinking(accessToken, onUpdate)
  const [pendingUnlink, setPendingUnlink] = useState<LinkedWallet | null>(null)
  const [busy, setBusy] = useState(false)

  const confirmUnlink = async () => {
    if (!pendingUnlink) return
    setBusy(true)
    try {
      await unlink(pendingUnlink.id)
      setPendingUnlink(null)
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('error.network'))
    } finally {
      setBusy(false)
    }
  }

  const linkButtons = (
    <div className="flex gap-2">
      <Button
        variant="secondary"
        size="sm"
        block={false}
        loading={pending === 'evm'}
        disabled={pending !== null}
        onClick={linkEvm}
        icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
      >
        {t('account.wallets.addEvm')}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        block={false}
        loading={pending === 'ton'}
        disabled={pending !== null}
        onClick={linkTon}
        icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
      >
        {t('account.wallets.addTon')}
      </Button>
    </div>
  )

  return (
    <>
      <Card>
        <CardHeader
          icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
          title={t('account.wallets.title')}
          description={t('account.wallets.subtitle')}
          action={wallets.length > 0 ? linkButtons : undefined}
        />

        {wallets.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
            title={t('account.wallets.empty')}
            hint={t('account.wallets.empty.hint')}
            action={linkButtons}
          />
        ) : (
          <div className="space-y-2">
            {wallets.map((wallet) => {
              const explorer = getExplorerUrl(wallet.address, wallet.chain)
              return (
                <Row
                  key={wallet.id}
                  icon={getChainIcon(wallet.chain)}
                  title={
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono">{formatAddress(wallet.address)}</span>
                      <Badge variant="neutral">{wallet.chain}</Badge>
                      {wallet.isPrimary && (
                        <Badge variant="accent">{t('account.wallets.primary')}</Badge>
                      )}
                    </span>
                  }
                  description={
                    <span className="flex flex-wrap items-center gap-2.5">
                      <CopyButton value={wallet.address} what="Address" />
                      {explorer && (
                        <a
                          href={explorer}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--text-faint)] transition-colors hover:text-[var(--text)]"
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          Explorer
                        </a>
                      )}
                      {wallet.createdAt && (
                        <span className="text-[var(--text-faint)]">
                          {formatRelativeDays(wallet.createdAt)}
                        </span>
                      )}
                    </span>
                  }
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      block={false}
                      aria-label={t('account.wallets.unlink')}
                      onClick={() => setPendingUnlink(wallet)}
                      icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                    />
                  }
                />
              )
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!pendingUnlink}
        intent="danger"
        title={t('account.wallets.unlink')}
        description={t('account.wallets.unlink.confirm')}
        confirmLabel={t('account.wallets.unlink')}
        cancelLabel={t('common.cancel')}
        busy={busy}
        onConfirm={confirmUnlink}
        onCancel={() => setPendingUnlink(null)}
      />
    </>
  )
}
