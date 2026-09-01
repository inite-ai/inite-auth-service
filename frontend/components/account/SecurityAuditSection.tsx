'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ShieldAlert,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Globe,
  ChevronDown,
} from 'lucide-react'
import api from '@/lib/api'
import { useT } from '@/lib/i18n'
import { Button, Card, CardHeader, Badge, Skeleton } from '@/components/ui'
import { EmptyState, SectionError, describeUserAgent, asList } from './shared'
import { groupAuditEvents, type AuditEvent } from './audit-events'

/** Rows shown before the list has to be asked for in full. */
const COLLAPSED_ROWS = 5

const EVENT_META: Record<
  string,
  { label: string; icon: typeof Activity; tone: 'good' | 'warn' | 'info' }
> = {
  'auth.login.password': { label: 'Signed in with password', icon: KeyRound, tone: 'good' },
  'auth.login.failed': { label: 'Failed sign-in attempt', icon: ShieldAlert, tone: 'warn' },
  'auth.flood.ip_blocked': {
    label: 'IP blocked after probing many accounts',
    icon: ShieldAlert,
    tone: 'warn',
  },
  'identity.password.changed': { label: 'Password changed', icon: KeyRound, tone: 'good' },
  'token.issued.authorization_code': {
    label: 'App access granted',
    icon: CheckCircle2,
    tone: 'info',
  },
  'token.refreshed': { label: 'Session token refreshed', icon: RefreshCw, tone: 'info' },
  'token.failed.invalid_credentials': {
    label: 'App authentication failed',
    icon: XCircle,
    tone: 'warn',
  },
}

function describeEvent(eventName: string) {
  return EVENT_META[eventName] ?? { label: eventName, icon: Activity, tone: 'info' as const }
}

const TONE_CLASS = {
  good: 'text-[color:var(--success)]',
  warn: 'text-[color:var(--warning)]',
  info: 'text-[var(--text-faint)]',
} as const

/**
 * Recent security events.
 *
 * This section used to render all twenty rows unconditionally, which on a
 * typical account meant ~1900px of identical "Signed in with password" —
 * roughly two full screens sitting between Security and everything below it.
 * It now collapses to five, folds consecutive identical events into a single
 * row with a count, and only expands on request.
 */
export default function SecurityAuditSection({ accessToken }: { accessToken: string }) {
  const t = useT()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/auth/security/audit?limit=20', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      setEvents(asList<AuditEvent>(data?.rows))
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t('error.network'))
    } finally {
      setLoading(false)
    }
  }, [accessToken, t])

  useEffect(() => {
    load()
  }, [load])

  const groups = useMemo(() => groupAuditEvents(events), [events])
  const visible = expanded ? groups : groups.slice(0, COLLAPSED_ROWS)
  const hidden = groups.length - visible.length

  return (
    <Card>
      <CardHeader
        icon={<Activity className="h-4 w-4" aria-hidden="true" />}
        title={t('account.activity.title')}
        description={t('account.activity.subtitle')}
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height="h-10" />
          ))}
        </div>
      ) : error ? (
        <SectionError
          title={t('account.error.title')}
          message={error}
          retryLabel={t('account.error.retry')}
          onRetry={load}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-4 w-4" aria-hidden="true" />}
          title={t('account.activity.empty')}
          hint={t('account.activity.empty.hint')}
        />
      ) : (
        <>
          <ul className="divide-y divide-[var(--border)]">
            {visible.map((group) => {
              const meta = describeEvent(group.event)
              const Icon = meta.icon
              const device = describeUserAgent(group.latest.userAgent)

              return (
                <li key={group.id} className="flex items-start gap-3 py-2.5">
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${TONE_CLASS[meta.tone]}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm text-[var(--text)]">
                          {meta.label}
                        </span>
                        {group.count > 1 && (
                          <Badge variant="neutral">
                            {t('account.activity.repeated', { count: group.count })}
                          </Badge>
                        )}
                      </span>
                      <time
                        dateTime={group.latest.ts}
                        className="shrink-0 text-xs text-[var(--text-faint)]"
                      >
                        {new Date(group.latest.ts).toLocaleString()}
                      </time>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--text-faint)]">
                      <span>{device ?? t('account.activity.unknownDevice')}</span>
                      {group.latest.ip && (
                        <span className="inline-flex items-center gap-1">
                          <Globe className="h-3 w-3" aria-hidden="true" />
                          {group.latest.ip}
                        </span>
                      )}
                      {group.latest.errorMessage && (
                        <span className="text-[color:var(--warning)]">
                          {group.latest.errorMessage}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          {(hidden > 0 || expanded) && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setExpanded((v) => !v)}
              iconTrailing={
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              }
            >
              {expanded
                ? t('account.activity.showLess')
                : t('account.activity.showAll', { count: groups.length })}
            </Button>
          )}
        </>
      )}
    </Card>
  )
}
