'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useT } from '@/lib/i18n'
import { Button, CopyButton, Input, Sheet } from '@/components/ui'
import { Qr, failure } from './qr'
import type { PixTopUp } from './use-inite-wallet'

/**
 * Two ways in, both straight to the wallet's address: a USDC transfer on Base
 * from anywhere, or a PIX that Hodle turns into USDC and delivers there.
 */
export function TopUpSheet({
  open,
  onClose,
  address,
  pix,
  topUpByPix,
  topUp,
  onPaid,
}: {
  open: boolean
  onClose: () => void
  address: string
  pix: boolean
  topUpByPix: (amount: string) => Promise<PixTopUp>
  topUp: (id: string) => Promise<PixTopUp>
  onPaid: () => void
}) {
  const t = useT()
  const [tab, setTab] = useState<'transfer' | 'pix'>('transfer')
  const [amount, setAmount] = useState('50')
  const [busy, setBusy] = useState(false)
  const [deposit, setDeposit] = useState<PixTopUp | null>(null)

  // Watch an open PIX until Hodle reports it paid.
  useEffect(() => {
    if (!deposit || deposit.status !== 'pending') return
    const timer = setInterval(async () => {
      const next = await topUp(deposit.id).catch(() => null)
      if (next && next.status !== deposit.status) {
        setDeposit({ ...next, qrCode: next.qrCode ?? deposit.qrCode })
        if (next.status === 'paid' || next.status === 'completed') onPaid()
      }
    }, 5_000)
    return () => clearInterval(timer)
  }, [deposit, topUp, onPaid])

  const startPix = async () => {
    setBusy(true)
    try {
      setDeposit(await topUpByPix(amount.replace(',', '.')))
    } catch (error) {
      toast.error(failure(error) ?? t('error.network'))
    } finally {
      setBusy(false)
    }
  }

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm transition-colors ${
      active
        ? 'bg-[var(--bg-elevated)] text-[var(--text)]'
        : 'text-[var(--text-muted)] hover:text-[var(--text)]'
    }`

  return (
    <Sheet open={open} onClose={onClose} title={t('account.initeWallet.topUp.title')} width="sm">
      {pix && (
        <div className="mb-5 flex gap-1" role="tablist">
          <button role="tab" aria-selected={tab === 'transfer'} className={tabClass(tab === 'transfer')} onClick={() => setTab('transfer')}>
            {t('account.initeWallet.topUp.transfer')}
          </button>
          <button role="tab" aria-selected={tab === 'pix'} className={tabClass(tab === 'pix')} onClick={() => setTab('pix')}>
            PIX
          </button>
        </div>
      )}

      {tab === 'transfer' ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">{t('account.initeWallet.topUp.transfer.hint')}</p>
          <Qr value={address} label={t('account.initeWallet.address')} />
          <div className="flex items-center gap-2 break-all font-mono text-sm text-[var(--text)]">
            {address}
            <CopyButton value={address} what="Address" />
          </div>
        </div>
      ) : deposit ? (
        <div className="space-y-4">
          {deposit.status === 'pending' && deposit.qrCode ? (
            <>
              <p className="text-sm text-[var(--text-muted)]">{t('account.initeWallet.topUp.pix.hint')}</p>
              <Qr value={deposit.qrCode} label="PIX" />
              <div className="flex items-center gap-2 text-sm text-[var(--text)]">
                {t('account.initeWallet.topUp.pix.code')}
                <CopyButton value={deposit.qrCode} what="PIX" />
              </div>
              <p className="text-xs text-[var(--text-faint)]">{t('account.initeWallet.topUp.pix.waiting')}</p>
            </>
          ) : (
            <p className="text-sm text-[var(--text)]">
              {t(`account.initeWallet.status.${deposit.status}` as never)}
              {(deposit.status === 'paid' || deposit.status === 'completed') &&
                ` — ${t('account.initeWallet.topUp.pix.done')}`}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            label={t('account.initeWallet.topUp.pix.amount')}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button loading={busy} onClick={startPix}>
            {t('account.initeWallet.topUp.pix.create')}
          </Button>
        </div>
      )}
    </Sheet>
  )
}
