'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useT } from '@/lib/i18n'
import { Button, Input, Sheet } from '@/components/ui'
import { Note } from '../shared'
import { BackupCodesPanel } from './BackupCodesPanel'

/**
 * Re-mint recovery codes.
 *
 * There was previously no path to this at all: the set shown once at
 * enrolment was the only set that would ever exist, so a user who lost it
 * had no recovery factor and no way to get one back short of support.
 */
export function BackupCodesSheet({
  open,
  onClose,
  accessToken,
  onDone,
}: {
  open: boolean
  onClose: () => void
  accessToken: string
  onDone: () => void
}) {
  const t = useT()
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [codes, setCodes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const close = () => {
    setPassword('')
    setVisible(false)
    setError(null)
    onClose()
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.post(
        '/auth/identity/2fa/backup-codes',
        { password },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      setCodes(data.backupCodes ?? [])
      setPassword('')
      toast.success(t('account.backupCodes.replaced'))
    } catch (err: any) {
      setError(err.response?.data?.message || t('error.network'))
    } finally {
      setBusy(false)
    }
  }

  const finish = () => {
    setCodes([])
    close()
    onDone()
  }

  const showingCodes = codes.length > 0

  return (
    <Sheet
      open={open}
      onClose={showingCodes ? finish : close}
      title={
        showingCodes
          ? t('account.backupCodes.saved.title')
          : t('account.backupCodes.regenerate')
      }
      width="sm"
      footer={
        showingCodes ? undefined : (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} loading={busy} disabled={password.length === 0}>
              {t('account.backupCodes.regenerate')}
            </Button>
          </div>
        )
      }
    >
      {showingCodes ? (
        <BackupCodesPanel codes={codes} onAcknowledge={finish} />
      ) : (
        <div className="space-y-4">
          <Note tone="warning">{t('account.backupCodes.replaced')}</Note>
          <Input
            name="password"
            type={visible ? 'text' : 'password'}
            autoComplete="current-password"
            label={t('common.password')}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
            error={error ?? undefined}
            showPasswordToggle
            isPasswordVisible={visible}
            onPasswordToggle={() => setVisible((v) => !v)}
          />
        </div>
      )}
    </Sheet>
  )
}
