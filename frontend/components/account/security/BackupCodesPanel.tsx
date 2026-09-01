'use client'

import { useState } from 'react'
import { Copy, Download, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui'
import { Note } from '../shared'

/**
 * One-time display of a freshly minted set of recovery codes.
 *
 * Shared by the 2FA setup flow and the regenerate flow so both present the
 * codes identically. Three things the previous version lacked and a locked-out
 * user needed: a download (copy alone loses them the moment the clipboard is
 * overwritten), an explicit statement that this is the only showing, and a
 * confirmation gate so "Done" is a deliberate acknowledgement rather than the
 * fastest way past a dialog.
 */
export function BackupCodesPanel({
  codes,
  onAcknowledge,
}: {
  codes: string[]
  onAcknowledge: () => void
}) {
  const t = useT()
  const [acknowledged, setAcknowledged] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(codes.join('\n'))
    toast.success(t('account.backupCodes.copied'))
  }

  const download = () => {
    const stamp = new Date().toISOString().split('T')[0]
    const body = [
      'INITE Identity — two-factor recovery codes',
      `Generated ${stamp}`,
      'Each code works once. Store them somewhere you can reach without this account.',
      '',
      ...codes,
      '',
    ].join('\n')

    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `inite-recovery-codes-${stamp}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <Note tone="warning" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
        <p className="font-medium">{t('account.backupCodes.saved.title')}</p>
        <p className="mt-0.5 text-[var(--text-muted)]">
          {t('account.backupCodes.saved.body')}
        </p>
      </Note>

      <ul className="grid grid-cols-2 gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-overlay)]/40 p-3">
        {codes.map((code) => (
          <li
            key={code}
            className="rounded bg-[var(--bg-elevated)] py-1.5 text-center font-mono text-sm tracking-wider text-[var(--text)]"
          >
            {code}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={copy}
          icon={<Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        >
          {t('account.backupCodes.copy')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={download}
          icon={<Download className="h-3.5 w-3.5" aria-hidden="true" />}
        >
          {t('account.backupCodes.download')}
        </Button>
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-xs text-[var(--text-muted)]">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
        />
        {t('account.backupCodes.confirm')}
      </label>

      <Button onClick={onAcknowledge} disabled={!acknowledged}>
        {t('common.continue')}
      </Button>
    </div>
  )
}
