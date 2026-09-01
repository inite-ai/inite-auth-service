'use client'

import { useCallback, useEffect, useState } from 'react'
import { Monitor, Smartphone, Trash2, LogOut, Globe } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useT } from '@/lib/i18n'
import { Button, Card, CardHeader, Badge, SkeletonRow, ConfirmDialog } from '@/components/ui'
import {
  Row,
  EmptyState,
  SectionError,
  formatRelativeDays,
  describeUserAgent,
  asList,
} from './shared'
import type { ActiveSession } from './types'

/** Inside this window an expiry is worth calling out rather than just dating. */
const EXPIRING_SOON_MS = 24 * 60 * 60 * 1000

/**
 * Where the account is signed in.
 *
 * Previously titled "Manage your logged-in devices" while listing refresh
 * tokens that stored no device at all — two sessions of the same client were
 * indistinguishable rows of the client's name. The API now carries IP, user
 * agent and last-used, so a row names something the user can recognise, and
 * the one they are reading from is marked rather than left to guess.
 */
export default function SessionsSection({ accessToken }: { accessToken: string }) {
  const t = useT()
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingRevoke, setPendingRevoke] = useState<ActiveSession | null>(null)
  const [revokingOthers, setRevokingOthers] = useState(false)
  const [busy, setBusy] = useState(false)

  const auth = { headers: { Authorization: `Bearer ${accessToken}` } }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/auth/session/active', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      setSessions(asList<ActiveSession>(data))
    } catch (err: any) {
      setError(err.response?.data?.message || t('error.network'))
    } finally {
      setLoading(false)
    }
  }, [accessToken, t])

  useEffect(() => {
    load()
  }, [load])

  const revokeOne = async () => {
    if (!pendingRevoke) return
    setBusy(true)
    try {
      await api.delete(`/auth/session/${pendingRevoke.id}`, auth)
      toast.success(t('account.sessions.revoked'))
      setPendingRevoke(null)
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('error.network'))
    } finally {
      setBusy(false)
    }
  }

  const revokeOthers = async () => {
    setBusy(true)
    try {
      // Spare the session we are reading from, so securing the account does
      // not also sign the user out of the page they are securing it from.
      const current = sessions.find((s) => s.isCurrentDevice)
      const query = current ? `?except=${encodeURIComponent(current.id)}` : ''
      await api.delete(`/auth/session${query}`, auth)
      toast.success(t('account.sessions.revokedOthers'))
      setRevokingOthers(false)
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('error.network'))
    } finally {
      setBusy(false)
    }
  }

  const hasOthers = sessions.some((s) => !s.isCurrentDevice)

  return (
    <>
      <Card>
        <CardHeader
          icon={<Monitor className="h-4 w-4" aria-hidden="true" />}
          title={t('account.sessions.title')}
          description={t('account.sessions.subtitle')}
          action={
            hasOthers ? (
              <Button
                variant="danger"
                size="sm"
                block={false}
                onClick={() => setRevokingOthers(true)}
                icon={<LogOut className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                {t('account.sessions.revokeOthers')}
              </Button>
            ) : undefined
          }
        />

        {loading ? (
          <div className="space-y-1">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : error ? (
          <SectionError
            title={t('account.error.title')}
            message={error}
            retryLabel={t('account.error.retry')}
            onRetry={load}
          />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<Monitor className="h-4 w-4" aria-hidden="true" />}
            title={t('account.sessions.empty')}
            hint={t('account.sessions.empty.hint')}
          />
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onRevoke={() => setPendingRevoke(session)}
              />
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!pendingRevoke}
        intent="danger"
        title={t('account.sessions.revoke')}
        description={t('account.sessions.revoke.confirm')}
        confirmLabel={t('account.sessions.revoke')}
        cancelLabel={t('common.cancel')}
        busy={busy}
        onConfirm={revokeOne}
        onCancel={() => setPendingRevoke(null)}
      />

      <ConfirmDialog
        open={revokingOthers}
        intent="danger"
        title={t('account.sessions.revokeOthers')}
        description={t('account.sessions.revokeOthers.confirm')}
        confirmLabel={t('account.sessions.revokeOthers')}
        cancelLabel={t('common.cancel')}
        busy={busy}
        onConfirm={revokeOthers}
        onCancel={() => setRevokingOthers(false)}
      />
    </>
  )
}

function SessionRow({
  session,
  onRevoke,
}: {
  session: ActiveSession
  onRevoke: () => void
}) {
  const t = useT()
  const device = describeUserAgent(session.userAgent)
  const isMobile = /Android|iOS/i.test(device ?? '')
  const expiringSoon =
    new Date(session.expiresAt).getTime() - Date.now() < EXPIRING_SOON_MS

  return (
    <Row
      icon={
        isMobile ? (
          <Smartphone className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Monitor className="h-4 w-4" aria-hidden="true" />
        )
      }
      title={
        <span className="flex flex-wrap items-center gap-1.5">
          {device ?? t('account.sessions.unknownDevice')}
          {session.isCurrentDevice && (
            <Badge variant="success">{t('account.sessions.thisDevice')}</Badge>
          )}
          {expiringSoon && (
            <Badge variant="warning">{t('account.sessions.expiringSoon')}</Badge>
          )}
        </span>
      }
      description={
        <span className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[var(--text)]">{session.clientName || session.clientId}</span>
            {session.ip && (
              <span className="inline-flex items-center gap-1 text-[var(--text-faint)]">
                <Globe className="h-3 w-3" aria-hidden="true" />
                {session.ip}
              </span>
            )}
          </span>
          <span className="text-[var(--text-faint)]">
            {session.lastUsedAt
              ? t('account.sessions.lastUsed', {
                  when: formatRelativeDays(session.lastUsedAt),
                })
              : t('account.sessions.created', {
                  when: formatRelativeDays(session.createdAt),
                })}
            {' · '}
            {t('account.sessions.expires', {
              when: formatRelativeDays(session.expiresAt),
            })}
          </span>
        </span>
      }
      action={
        session.isCurrentDevice ? undefined : (
          <Button
            variant="ghost"
            size="sm"
            block={false}
            aria-label={t('account.sessions.revoke')}
            onClick={onRevoke}
            icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
          />
        )
      }
    />
  )
}
