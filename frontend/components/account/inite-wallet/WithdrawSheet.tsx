'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { ExternalLink } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Button, Input, Sheet } from '@/components/ui'
import { explorer, failure } from './qr'
import type { WalletActivity } from './use-inite-wallet'

/** Send USDC out of the wallet. The passkey approves it; INITE pays the network fee. */
export function WithdrawSheet({
  open,
  onClose,
  balance,
  withdraw,
}: {
  open: boolean
  onClose: () => void
  balance: string | null
  withdraw: (to: string, amount: string) => Promise<WalletActivity>
}) {
  const t = useT()
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<WalletActivity | null>(null)

  const close = () => {
    setSent(null)
    setTo('')
    setAmount('')
    onClose()
  }

  const submit = async () => {
    setBusy(true)
    try {
      setSent(await withdraw(to.trim(), amount.trim().replace(',', '.')))
    } catch (error) {
      const reason = failure(error)
      if (reason === 'cancelled') toast(t('account.initeWallet.cancelled'))
      else toast.error(reason ?? t('error.network'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t('account.initeWallet.withdraw.title')}
      width="sm"
      dirty={!sent && (to !== '' || amount !== '')}
    >
      {sent ? (
        <div className="space-y-3 text-sm text-[var(--text)]">
          <p>
            {sent.status === 'mined'
              ? t('account.initeWallet.withdraw.sent')
              : t('account.initeWallet.withdraw.pending')}
          </p>
          {sent.txHash && (
            <a
              href={explorer.tx(sent.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Basescan
            </a>
          )}
          <Button variant="secondary" onClick={close}>
            {t('account.initeWallet.done')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            label={t('account.initeWallet.withdraw.to')}
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <Input
            label={t('account.initeWallet.withdraw.amount')}
            inputMode="decimal"
            value={amount}
            helper={balance ? `${t('account.initeWallet.balance')}: ${balance} USDC` : undefined}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="text-xs text-[var(--text-faint)]">{t('account.initeWallet.withdraw.hint')}</p>
          <Button loading={busy} disabled={!to || !amount} onClick={submit}>
            {t('account.initeWallet.withdraw.submit')}
          </Button>
        </div>
      )}
    </Sheet>
  )
}
