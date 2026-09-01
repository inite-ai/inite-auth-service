'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useT } from '@/lib/i18n'
import { Button, Input, Sheet } from '@/components/ui'
import { Note } from '../shared'

/** Turn off 2FA. Password + current code, with the consequence stated. */
export function TwoFactorDisableSheet({
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
  const [code, setCode] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setPassword('')
    setCode('')
    setVisible(false)
    setError(null)
  }

  const close = () => {
    reset()
    onClose()
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.post(
        '/auth/identity/2fa/disable',
        { code, password },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      toast.success(t('account.twoFactor.disabled'))
      reset()
      onClose()
      onDone()
    } catch (err: any) {
      setError(err.response?.data?.message || t('error.network'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t('account.twoFactor.disable.title')}
      width="sm"
      dirty={!busy && (password.length > 0 || code.length > 0)}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            loading={busy}
            disabled={code.length !== 6 || password.length === 0}
          >
            {t('account.twoFactor.disable.submit')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Note tone="warning" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
          {t('account.twoFactor.disable.warning')}
        </Note>

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
          name="totp"
          inputMode="numeric"
          autoComplete="one-time-code"
          label={t('account.twoFactor.code')}
          placeholder="000000"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
            setError(null)
          }}
          error={error ?? undefined}
          className="text-center font-mono tracking-[0.35em]"
        />
      </div>
    </Sheet>
  )
}
