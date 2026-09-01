'use client'

import { useState } from 'react'
import { Check, Circle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useT } from '@/lib/i18n'
import { Button, Input, Sheet } from '@/components/ui'
import { Note } from '../shared'
import { PASSWORD_RULES, meetsPasswordRules } from './password-rules'

/**
 * Change-password panel with the server's rules shown live.
 *
 * Also states the consequence up front: changing the password now revokes
 * every refresh token, so other devices are signed out. That was already
 * true of nothing — the old flow left other sessions alive — and is now both
 * true and disclosed before the user commits.
 */
export function PasswordSheet({
  open,
  onClose,
  hasPassword,
  accessToken,
  onDone,
}: {
  open: boolean
  onClose: () => void
  hasPassword: boolean
  accessToken: string
  onDone: () => void
}) {
  const t = useT()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const matches = next.length > 0 && next === confirm
  const valid = meetsPasswordRules(next) && matches && (!hasPassword || current.length > 0)

  const reset = () => {
    setCurrent('')
    setNext('')
    setConfirm('')
    setVisible(false)
    setError(null)
  }

  const close = () => {
    reset()
    onClose()
  }

  const submit = async () => {
    if (!meetsPasswordRules(next)) {
      setError(t('account.password.error.rules'))
      return
    }
    if (!matches) {
      setError(t('account.password.error.mismatch'))
      return
    }

    setBusy(true)
    setError(null)
    try {
      await api.post(
        '/auth/identity/change-password',
        { currentPassword: current, newPassword: next },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      toast.success(t('account.password.changed'))
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
      title={hasPassword ? t('account.password.sheet.title') : t('account.password.create')}
      width="sm"
      dirty={!busy && (current.length > 0 || next.length > 0 || confirm.length > 0)}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={busy} disabled={!valid}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {hasPassword && (
          <Note tone="warning" icon={<AlertCircle className="h-3.5 w-3.5" />}>
            {t('account.password.sheet.subtitle')}
          </Note>
        )}

        {hasPassword && (
          <Input
            name="currentPassword"
            type={visible ? 'text' : 'password'}
            autoComplete="current-password"
            label={t('account.password.current')}
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value)
              setError(null)
            }}
          />
        )}

        <Input
          name="newPassword"
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          label={t('account.password.new')}
          value={next}
          onChange={(e) => {
            setNext(e.target.value)
            setError(null)
          }}
          showPasswordToggle
          isPasswordVisible={visible}
          onPasswordToggle={() => setVisible((v) => !v)}
        />

        <Input
          name="confirmPassword"
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          label={t('account.password.confirm')}
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            setError(null)
          }}
          error={error ?? undefined}
        />

        <ul className="space-y-1">
          {PASSWORD_RULES.map((rule) => (
            <RuleItem key={rule.key} met={rule.satisfiedBy(next)} label={t(rule.key)} />
          ))}
          <RuleItem met={matches} label={t('account.password.rule.match')} />
        </ul>
      </div>
    </Sheet>
  )
}

function RuleItem({ met, label }: { met: boolean; label: string }) {
  return (
    <li
      className={`flex items-center gap-2 text-xs ${
        met ? 'text-[color:var(--success)]' : 'text-[var(--text-faint)]'
      }`}
    >
      {met ? (
        <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
      ) : (
        <Circle className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
      {label}
    </li>
  )
}
