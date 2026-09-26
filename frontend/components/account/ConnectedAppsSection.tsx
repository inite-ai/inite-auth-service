'use client'

import { useCallback, useEffect, useState } from 'react'
import { AppWindow, Unplug } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useT } from '@/lib/i18n'
import { Button, Card, CardHeader, SkeletonRow, ConfirmDialog } from '@/components/ui'
import { Row, EmptyState, SectionError, formatRelativeDays, asList } from './shared'

interface ConnectedApp {
  clientId: string
  name: string
  logoUrl: string | null
  scopes: string[]
  grantedAt: string
  updatedAt: string
}

/**
 * Applications this person has let in through the consent screen.
 *
 * Consent is remembered now — the screen is shown once per application,
 * not on every sign-in — so the person needs a place to take it back.
 * Disconnecting forgets the consent and revokes the application's refresh
 * tokens: next time it has to ask again.
 */
export default function ConnectedAppsSection({ accessToken }: { accessToken: string }) {
  const t = useT()
  const [apps, setApps] = useState<ConnectedApp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<ConnectedApp | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/oauth/consents', { headers: { Authorization: `Bearer ${accessToken}` } })
      setApps(asList<ConnectedApp>(data))
    } catch (err: any) {
      setError(err.response?.data?.message || t('error.network'))
    } finally {
      setLoading(false)
    }
  }, [accessToken, t])

  useEffect(() => {
    load()
  }, [load])

  const disconnect = async () => {
    if (!pending) return
    setBusy(true)
    try {
      await api.delete(`/oauth/consents/${encodeURIComponent(pending.clientId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      toast.success(t('account.apps.disconnected'))
      setPending(null)
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('error.network'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          icon={<AppWindow className="h-4 w-4" aria-hidden="true" />}
          title={t('account.apps.title')}
          description={t('account.apps.subtitle')}
        />

        {loading ? (
          <div className="space-y-1">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : error ? (
          <SectionError title={t('account.error.title')} message={error} retryLabel={t('account.error.retry')} onRetry={load} />
        ) : apps.length === 0 ? (
          <EmptyState
            icon={<AppWindow className="h-4 w-4" aria-hidden="true" />}
            title={t('account.apps.empty')}
            hint={t('account.apps.empty.hint')}
          />
        ) : (
          <div className="space-y-2">
            {apps.map((app) => (
              <Row
                key={app.clientId}
                icon={<AppWindow className="h-4 w-4" aria-hidden="true" />}
                title={app.name}
                description={
                  <>
                    {t('account.apps.granted', { when: formatRelativeDays(app.updatedAt) })}
                    {app.scopes.length > 0 && <span className="font-mono"> · {app.scopes.join(' ')}</span>}
                  </>
                }
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    block={false}
                    onClick={() => setPending(app)}
                    icon={<Unplug className="h-3.5 w-3.5" aria-hidden="true" />}
                  >
                    {t('account.apps.disconnect')}
                  </Button>
                }
              />
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!pending}
        intent="danger"
        title={t('account.apps.disconnect')}
        description={t('account.apps.disconnect.confirm', { name: pending?.name ?? '' })}
        confirmLabel={t('account.apps.disconnect')}
        cancelLabel={t('common.cancel')}
        busy={busy}
        onConfirm={disconnect}
        onCancel={() => setPending(null)}
      />
    </>
  )
}
