'use client'

import { useState } from 'react'
import { Fingerprint, Plus, Trash2, Smartphone, Laptop } from 'lucide-react'
import { startRegistration } from '@simplewebauthn/browser'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useT } from '@/lib/i18n'
import { Button, Card, CardHeader, ConfirmDialog } from '@/components/ui'
import { Row, EmptyState, formatRelativeDays } from './shared'
import type { Passkey } from './types'

interface PasskeysSectionProps {
  passkeys: Passkey[]
  hasPassword: boolean
  accessToken: string
  onUpdate: () => void
}

export default function PasskeysSection({
  passkeys,
  hasPassword,
  accessToken,
  onUpdate,
}: PasskeysSectionProps) {
  const t = useT()
  const [adding, setAdding] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<Passkey | null>(null)
  const [removing, setRemoving] = useState(false)

  const auth = { headers: { Authorization: `Bearer ${accessToken}` } }

  const handleAdd = async () => {
    setAdding(true)
    try {
      const { data: options } = await api.post(
        '/auth/passkey/registration/options',
        {},
        auth,
      )
      const response = await startRegistration(options)
      // The server reads the expected challenge from Redis (where /options
      // stored it) — the client is never trusted to supply it.
      await api.post('/auth/passkey/registration/verify', { response }, auth)
      toast.success(t('account.passkeys.added'))
      onUpdate()
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        toast.error(t('account.passkeys.cancelled'))
      } else {
        toast.error(error.response?.data?.message || t('error.network'))
      }
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async () => {
    if (!pendingRemoval) return
    setRemoving(true)
    try {
      await api.post('/auth/passkey/delete', { passkeyId: pendingRemoval.id }, auth)
      toast.success(t('account.passkeys.removed'))
      setPendingRemoval(null)
      onUpdate()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('error.network'))
    } finally {
      setRemoving(false)
    }
  }

  const addButton = (
    <Button
      size="sm"
      block={false}
      loading={adding}
      onClick={handleAdd}
      icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
    >
      {t('account.passkeys.add')}
    </Button>
  )

  // Removing the only passwordless method is reversible but consequential —
  // worth naming before the confirmation rather than after.
  const isLastPasskey = passkeys.length === 1 && hasPassword

  return (
    <>
      <Card>
        <CardHeader
          icon={<Fingerprint className="h-4 w-4" aria-hidden="true" />}
          title={t('account.passkeys.title')}
          description={t('account.passkeys.subtitle')}
          action={passkeys.length > 0 ? addButton : undefined}
        />

        {passkeys.length === 0 ? (
          <EmptyState
            icon={<Fingerprint className="h-4 w-4" aria-hidden="true" />}
            title={t('account.passkeys.empty')}
            hint={t('account.passkeys.empty.hint')}
            action={addButton}
          />
        ) : (
          <div className="space-y-2">
            {passkeys.map((passkey) => (
              <Row
                key={passkey.id}
                icon={
                  /phone|mobile|android|ios/i.test(passkey.deviceType ?? '') ? (
                    <Smartphone className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Laptop className="h-4 w-4" aria-hidden="true" />
                  )
                }
                title={passkey.name || t('account.passkeys.title')}
                description={
                  <span className="flex flex-wrap gap-x-2">
                    <span>{formatRelativeDays(passkey.createdAt)}</span>
                    {passkey.lastUsedAt && (
                      <span className="text-[var(--text-faint)]">
                        · {formatRelativeDays(passkey.lastUsedAt)}
                      </span>
                    )}
                  </span>
                }
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    block={false}
                    aria-label={t('account.passkeys.remove')}
                    onClick={() => setPendingRemoval(passkey)}
                    icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  />
                }
              />
            ))}
          </div>
        )}

      </Card>

      <ConfirmDialog
        open={!!pendingRemoval}
        intent="danger"
        title={t('account.passkeys.remove')}
        description={
          <>
            {t('account.passkeys.remove.confirm')}
            {isLastPasskey && (
              <span className="mt-1.5 block text-[color:var(--warning)]">
                {t('account.passkeys.lastOne')}
              </span>
            )}
          </>
        }
        confirmLabel={t('account.passkeys.remove')}
        cancelLabel={t('common.cancel')}
        busy={removing}
        onConfirm={handleRemove}
        onCancel={() => setPendingRemoval(null)}
      />
    </>
  )
}
