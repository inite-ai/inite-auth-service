'use client'

import { useState } from 'react'
import { Database, Trash2, FileDown, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useT } from '@/lib/i18n'
import { Button, Card, CardHeader, Input, Sheet } from '@/components/ui'
import { Row, Note } from './shared'

/** The literal a user must type to arm account deletion. */
const CONFIRM_WORD = 'DELETE'

export default function DangerZoneSection({
  accessToken,
  onDeleteAccount,
}: {
  accessToken: string
  onDeleteAccount: () => void
}) {
  const t = useT()
  const [exporting, setExporting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const { data } = await api.get('/auth/identity/export', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `inite-data-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success(t('account.data.export.done'))
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('error.network'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          icon={<Database className="h-4 w-4" aria-hidden="true" />}
          title={t('account.data.title')}
          description={t('account.data.subtitle')}
        />

        <div className="space-y-2">
          <Row
            icon={<FileDown className="h-4 w-4" aria-hidden="true" />}
            title={t('account.data.export.title')}
            description={t('account.data.export.body')}
            action={
              <Button
                variant="secondary"
                size="sm"
                block={false}
                loading={exporting}
                onClick={handleExport}
              >
                {t('account.data.export.cta')}
              </Button>
            }
          />

          <Row
            tone="danger"
            icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
            title={t('account.data.delete.title')}
            description={t('account.data.delete.body')}
            action={
              <Button
                variant="danger"
                size="sm"
                block={false}
                onClick={() => setDeleteOpen(true)}
              >
                {t('account.data.delete.cta')}
              </Button>
            }
          />
        </div>
      </Card>

      <DeleteAccountSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        accessToken={accessToken}
        onDeleted={onDeleteAccount}
      />
    </>
  )
}

function DeleteAccountSheet({
  open,
  onClose,
  accessToken,
  onDeleted,
}: {
  open: boolean
  onClose: () => void
  accessToken: string
  onDeleted: () => void
}) {
  const t = useT()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const armed = confirmation === CONFIRM_WORD && password.length > 0

  const close = () => {
    setPassword('')
    setConfirmation('')
    setVisible(false)
    setError(null)
    onClose()
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.delete('/auth/identity/account', {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { password },
      })
      toast.success(t('account.data.delete.done'))
      onDeleted()
    } catch (err: any) {
      setError(err.response?.data?.message || t('error.network'))
    } finally {
      setBusy(false)
    }
  }

  const removed = [
    t('account.data.delete.item.identity'),
    t('account.data.delete.item.wallets'),
    t('account.data.delete.item.passkeys'),
    t('account.data.delete.item.sessions'),
    t('account.data.delete.item.credentials'),
  ]

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t('account.data.delete.sheet.title')}
      width="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={submit} loading={busy} disabled={!armed}>
            {t('account.data.delete.submit')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Note tone="warning" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
          {t('account.data.delete.sheet.warning')}
        </Note>

        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
            {t('account.data.delete.sheet.list')}
          </p>
          <ul className="mt-2 space-y-1">
            {removed.map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
                <span aria-hidden="true">·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

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
          showPasswordToggle
          isPasswordVisible={visible}
          onPasswordToggle={() => setVisible((v) => !v)}
        />

        <Input
          name="deleteConfirmation"
          label={t('account.data.delete.confirmLabel', { word: CONFIRM_WORD })}
          placeholder={CONFIRM_WORD}
          value={confirmation}
          onChange={(e) => {
            setConfirmation(e.target.value)
            setError(null)
          }}
          error={error ?? undefined}
          className="font-mono"
        />
      </div>
    </Sheet>
  )
}
