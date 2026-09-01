'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useT } from '@/lib/i18n'
import { validateEmail } from '@/lib/validation'
import { Button, Input, Sheet } from '@/components/ui'

/**
 * Change-email panel.
 *
 * Replaces a hand-rolled centred modal that had no dialog role, no focus
 * trap, no Escape handling and no client-side validation — a typo'd address
 * only surfaced as a server error after the confirmation mail had already
 * gone out. `Sheet` supplies the dialog semantics and the unsaved-edits
 * guard; the checks below stop the obvious mistakes before the request.
 */
export function EmailChangeSheet({
  open,
  onClose,
  currentEmail,
  accessToken,
  onDone,
}: {
  open: boolean
  onClose: () => void
  currentEmail: string
  accessToken: string
  onDone: () => void
}) {
  const t = useT()
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setNewEmail('')
    setPassword('')
    setError(null)
    setShowPassword(false)
  }

  const close = () => {
    reset()
    onClose()
  }

  const validate = (): string | null => {
    const emailError = validateEmail(newEmail)
    if (emailError) return emailError
    if (newEmail.trim().toLowerCase() === currentEmail.trim().toLowerCase()) {
      return t('account.email.error.same')
    }
    if (!password) return t('validation.password.required')
    return null
  }

  const submit = async () => {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }

    setBusy(true)
    setError(null)
    try {
      await api.post(
        '/auth/identity/email/change',
        { newEmail: newEmail.trim(), password },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      toast.success(t('account.email.sheet.sent'))
      reset()
      onClose()
      // Refresh so the pending-change notice appears immediately rather
      // than leaving the profile looking untouched.
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
      title={t('account.email.sheet.title')}
      subtitle={t('account.email.sheet.subtitle')}
      width="sm"
      dirty={!busy && (newEmail.length > 0 || password.length > 0)}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={busy}>
            {t('account.email.sheet.submit')}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Input
          name="newEmail"
          type="email"
          autoComplete="email"
          label={t('account.email.sheet.new')}
          placeholder="new@example.com"
          value={newEmail}
          onChange={(e) => {
            setNewEmail(e.target.value)
            setError(null)
          }}
          error={error ?? undefined}
        />
        <Input
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          label={t('account.email.sheet.password')}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError(null)
          }}
          showPasswordToggle
          isPasswordVisible={showPassword}
          onPasswordToggle={() => setShowPassword((v) => !v)}
        />
        {/* Lets Enter submit without a visible duplicate of the footer action. */}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Sheet>
  )
}
