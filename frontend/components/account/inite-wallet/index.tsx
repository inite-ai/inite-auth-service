'use client'

import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, ExternalLink, KeyRound, WalletCards } from 'lucide-react'
import toast from 'react-hot-toast'
import { useT } from '@/lib/i18n'
import { Badge, Button, Card, CardHeader, CopyButton, SkeletonRow } from '@/components/ui'
import { EmptyState, Row, SectionError, formatRelativeDays } from '../shared'
import { formatAddress } from '../wallets/chains'
import { explorer, failure } from './qr'
import { TopUpSheet } from './TopUpSheet'
import { WithdrawSheet } from './WithdrawSheet'
import { useIniteWallet, type WalletActivity } from './use-inite-wallet'

/**
 * The person's INITE wallet: their own USDC on Base, kept by billing under
 * their passkey. INITE opens it and shows it; only the passkey moves money
 * out. Their AI agents will pay from it within limits set on the consent
 * screen.
 */
export default function IniteWalletSection({
  accessToken,
  label,
}: {
  accessToken: string
  label: string
}) {
  const t = useT()
  const { state, reload, open, topUpByPix, topUp, withdraw } = useIniteWallet(accessToken, label)
  const [creating, setCreating] = useState(false)
  const [sheet, setSheet] = useState<'topUp' | 'withdraw' | null>(null)

  const header = (
    <CardHeader
      icon={<WalletCards className="h-4 w-4" aria-hidden="true" />}
      title={t('account.initeWallet.title')}
      description={t('account.initeWallet.subtitle')}
    />
  )

  if (state.status === 'loading') {
    return (
      <Card>
        {header}
        <SkeletonRow />
      </Card>
    )
  }
  if (state.status === 'error') {
    return (
      <Card>
        {header}
        <SectionError
          title={t('account.error.title')}
          message={t('account.initeWallet.loadFailed')}
          retryLabel={t('account.error.retry')}
          onRetry={reload}
        />
      </Card>
    )
  }

  const { wallet, canOpen, canWithdraw, topups, history = [] } = state.data

  const create = async () => {
    setCreating(true)
    try {
      await open()
      toast.success(t('account.initeWallet.created'))
    } catch (error) {
      const reason = failure(error)
      if (reason === 'cancelled') toast(t('account.initeWallet.cancelled'))
      else toast.error(reason ?? t('error.network'))
    } finally {
      setCreating(false)
    }
  }

  if (!wallet) {
    return (
      <Card>
        {header}
        <EmptyState
          icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
          title={canOpen ? t('account.initeWallet.empty') : t('account.initeWallet.unavailable')}
          hint={canOpen ? t('account.initeWallet.empty.hint') : undefined}
          action={
            canOpen ? (
              <Button size="sm" block={false} loading={creating} onClick={create}>
                {t('account.initeWallet.create')}
              </Button>
            ) : undefined
          }
        />
      </Card>
    )
  }

  return (
    <>
      <Card>
        {header}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--text-faint)]">{t('account.initeWallet.balance')}</p>
            <p className="text-2xl font-semibold tabular-nums text-[var(--text)]">
              {wallet.balance === null ? '—' : `${trim(wallet.balance)} USDC`}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
              <span className="font-mono">{formatAddress(wallet.address)}</span>
              <Badge variant="neutral">Base</Badge>
              <CopyButton value={wallet.address} what="Address" />
              <a
                href={explorer.address(wallet.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[var(--text-faint)] hover:text-[var(--text)]"
              >
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                Basescan
              </a>
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" block={false} onClick={() => setSheet('topUp')}>
              {t('account.initeWallet.topUp')}
            </Button>
            <Button
              size="sm"
              block={false}
              variant="secondary"
              disabled={!canWithdraw || !Number(wallet.balance)}
              onClick={() => setSheet('withdraw')}
            >
              {t('account.initeWallet.withdraw')}
            </Button>
          </div>
        </div>

        {history.length > 0 && (
          <div className="mt-5 space-y-2 border-t border-[var(--border)] pt-4">
            <p className="text-xs text-[var(--text-faint)]">{t('account.initeWallet.history')}</p>
            {history.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-[var(--text-faint)]">{t('account.initeWallet.safety')}</p>
      </Card>

      <TopUpSheet
        open={sheet === 'topUp'}
        onClose={() => setSheet(null)}
        address={wallet.address}
        pix={topups.pix}
        topUpByPix={topUpByPix}
        topUp={topUp}
        onPaid={reload}
      />
      <WithdrawSheet
        open={sheet === 'withdraw'}
        onClose={() => setSheet(null)}
        balance={wallet.balance}
        withdraw={withdraw}
      />
    </>
  )
}

function ActivityRow({ item }: { item: WalletActivity }) {
  const t = useT()
  const incoming = item.kind === 'topup'
  return (
    <Row
      icon={
        incoming ? (
          <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        )
      }
      title={
        <span className="tabular-nums">
          {incoming ? `+${item.amount} ${item.currency}` : `−${trim(item.amount)} USDC`}
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-2">
          <span>
            {incoming
              ? t('account.initeWallet.history.topup', { rail: item.rail === 'HODLE' ? 'PIX' : (item.rail ?? '') })
              : t('account.initeWallet.history.withdrawal', { to: formatAddress(item.to ?? '') })}
          </span>
          <span className="text-[var(--text-faint)]">{formatRelativeDays(item.createdAt)}</span>
          {item.txHash && (
            <a
              href={explorer.tx(item.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-faint)] hover:text-[var(--text)]"
            >
              Basescan
            </a>
          )}
        </span>
      }
      action={<Badge variant="neutral">{t(`account.initeWallet.status.${item.status}` as never)}</Badge>}
    />
  )
}

/** 12.500000 → 12.5 */
function trim(amount: string): string {
  return amount.includes('.') ? amount.replace(/\.?0+$/, '') : amount
}
