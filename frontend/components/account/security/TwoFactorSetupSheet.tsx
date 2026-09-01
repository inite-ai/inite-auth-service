'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useT } from '@/lib/i18n'
import { Button, Input, Sheet, CopyButton, Skeleton } from '@/components/ui'
import { SectionError } from '../shared'
import { BackupCodesPanel } from './BackupCodesPanel'

/**
 * Two-factor enrolment: scan, verify, then save the recovery codes.
 *
 * The setup call is issued when the panel opens rather than by the caller
 * before it, so a user who abandons enrolment and comes back gets a secret
 * matched to the panel they are looking at.
 */
export function TwoFactorSetupSheet({
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
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [loadFailure, setLoadFailure] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const auth = { headers: { Authorization: `Bearer ${accessToken}` } }

  const startSetup = async () => {
    setLoading(true)
    setLoadFailure(null)
    try {
      const { data } = await api.post('/auth/identity/2fa/setup', {}, auth)
      setQrCode(data.qrCode)
      setSecret(data.secret)
    } catch (err: any) {
      setLoadFailure(err.response?.data?.message || t('error.network'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setCode('')
    setError(null)
    setBackupCodes([])
    startSetup()
    // Re-running only on open is deliberate: a fresh panel gets a fresh secret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const verify = async () => {
    setVerifying(true)
    setError(null)
    try {
      const { data } = await api.post('/auth/identity/2fa/enable', { code }, auth)
      setBackupCodes(data.backupCodes ?? [])
      toast.success(t('account.twoFactor.setup.enabled'))
    } catch (err: any) {
      setError(err.response?.data?.message || t('error.network'))
    } finally {
      setVerifying(false)
    }
  }

  const finish = () => {
    setBackupCodes([])
    onClose()
    onDone()
  }

  // Once the codes are on screen the factor is already enabled — closing
  // without acknowledging them would silently discard the only copy, so the
  // panel drops its dismiss affordances at that point.
  const showingCodes = backupCodes.length > 0

  return (
    <Sheet
      open={open}
      onClose={showingCodes ? finish : onClose}
      title={
        showingCodes
          ? t('account.backupCodes.saved.title')
          : t('account.twoFactor.setup.title')
      }
      width="sm"
      footer={
        showingCodes ? undefined : (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={verifying}>
              {t('common.cancel')}
            </Button>
            <Button onClick={verify} loading={verifying} disabled={code.length !== 6}>
              {t('account.twoFactor.setup.submit')}
            </Button>
          </div>
        )
      }
    >
      {showingCodes ? (
        <BackupCodesPanel codes={backupCodes} onAcknowledge={finish} />
      ) : loadFailure ? (
        <SectionError
          title={t('account.error.title')}
          message={loadFailure}
          retryLabel={t('account.error.retry')}
          onRetry={startSetup}
        />
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-sm text-[var(--text-muted)]">
              {t('account.twoFactor.setup.step1')}
            </p>
            <div className="mt-3 flex justify-center">
              {loading ? (
                <Skeleton width="w-44" height="h-44" rounded="rounded-lg" />
              ) : (
                qrCode && (
                  <img
                    src={qrCode}
                    alt=""
                    className="h-44 w-44 rounded-lg bg-white p-2"
                  />
                )
              )}
            </div>
          </div>

          <div className="rounded-md border border-[var(--border)] bg-[var(--bg-overlay)]/40 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
              {t('account.twoFactor.setup.manual')}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              {loading ? (
                <Skeleton height="h-4" />
              ) : (
                <>
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-[var(--text)]">
                    {secret}
                  </code>
                  <CopyButton value={secret} what="Setup key" />
                </>
              )}
            </div>
          </div>

          <Input
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            label={t('account.twoFactor.setup.step2')}
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
      )}
    </Sheet>
  )
}
