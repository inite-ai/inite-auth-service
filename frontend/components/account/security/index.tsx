'use client'

import { useState } from 'react'
import { Shield, KeyRound, Smartphone, LifeBuoy } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Button, Card, CardHeader } from '@/components/ui'
import { Row, Note } from '../shared'
import { ProtectionSummary } from './ProtectionSummary'
import { PasswordSheet } from './PasswordSheet'
import { TwoFactorSetupSheet } from './TwoFactorSetupSheet'
import { TwoFactorDisableSheet } from './TwoFactorDisableSheet'
import { BackupCodesSheet } from './BackupCodesSheet'
import type { SecurityStatus } from '../types'

/** Below this, the user is close enough to lockout that we say so. */
const LOW_BACKUP_CODES = 3

export default function SecuritySection({
  securityStatus,
  accessToken,
  onUpdate,
}: {
  securityStatus: SecurityStatus
  accessToken: string
  onUpdate: () => void
}) {
  const t = useT()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)

  const { hasPassword, twoFactorEnabled, backupCodesRemaining } = securityStatus

  return (
    <>
      <Card>
        <CardHeader
          icon={<Shield className="h-4 w-4" aria-hidden="true" />}
          title={t('account.security.title')}
          description={t('account.security.subtitle')}
        />

        <div className="space-y-3">
          <ProtectionSummary status={securityStatus} />

          <Row
            icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
            title={t('account.password.title')}
            description={
              hasPassword ? t('account.password.set') : t('account.password.unset')
            }
            action={
              <Button
                variant="secondary"
                size="sm"
                block={false}
                onClick={() => setPasswordOpen(true)}
              >
                {hasPassword ? t('account.password.change') : t('account.password.create')}
              </Button>
            }
          />

          <Row
            icon={<Smartphone className="h-4 w-4" aria-hidden="true" />}
            title={t('account.twoFactor.title')}
            description={
              twoFactorEnabled ? t('account.twoFactor.on') : t('account.twoFactor.off')
            }
            action={
              twoFactorEnabled ? (
                <Button
                  variant="danger"
                  size="sm"
                  block={false}
                  onClick={() => setDisableOpen(true)}
                >
                  {t('account.twoFactor.disable')}
                </Button>
              ) : (
                <Button size="sm" block={false} onClick={() => setSetupOpen(true)}>
                  {t('account.twoFactor.enable')}
                </Button>
              )
            }
          />

          {twoFactorEnabled && (
            <>
              <Row
                icon={<LifeBuoy className="h-4 w-4" aria-hidden="true" />}
                title={t('account.backupCodes.title')}
                description={t('account.backupCodes.remaining', {
                  count: backupCodesRemaining,
                })}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    block={false}
                    onClick={() => setBackupOpen(true)}
                  >
                    {t('account.backupCodes.regenerate')}
                  </Button>
                }
              />
              {backupCodesRemaining === 0 ? (
                <Note tone="warning">{t('account.backupCodes.none')}</Note>
              ) : (
                backupCodesRemaining <= LOW_BACKUP_CODES && (
                  <Note tone="warning">
                    {t('account.backupCodes.low', { count: backupCodesRemaining })}
                  </Note>
                )
              )}
            </>
          )}
        </div>
      </Card>

      <PasswordSheet
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        hasPassword={hasPassword}
        accessToken={accessToken}
        onDone={onUpdate}
      />
      <TwoFactorSetupSheet
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        accessToken={accessToken}
        onDone={onUpdate}
      />
      <TwoFactorDisableSheet
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        accessToken={accessToken}
        onDone={onUpdate}
      />
      <BackupCodesSheet
        open={backupOpen}
        onClose={() => setBackupOpen(false)}
        accessToken={accessToken}
        onDone={onUpdate}
      />
    </>
  )
}
