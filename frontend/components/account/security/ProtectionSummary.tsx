'use client'

import { Check, ArrowRight } from 'lucide-react'
import { useT } from '@/lib/i18n'
import type { TKey } from '@/lib/i18n'
import { Badge } from '@/components/ui'
import type { SecurityStatus } from '../types'

/**
 * Account-protection summary.
 *
 * The old version showed a bare percentage and chips for what was already
 * done — it told a user at 30% that they were at 30% and stopped there. What
 * raises the number, and by how much, lived only in the scoring function.
 * This renders the same weights as a checklist: what is done, and what to do
 * next with the points it is worth, each linking to the section that does it.
 */

interface Measure {
  id: string
  weight: number
  met: boolean
  doneKey: TKey
  todoKey: TKey
  /** In-page anchor that performs this measure. */
  href: string
  /** Interpolation values for the done label. */
  vars?: Record<string, string | number>
}

function measures(status: SecurityStatus): Measure[] {
  return [
    {
      id: 'twoFactor',
      weight: 30,
      met: status.twoFactorEnabled,
      doneKey: 'account.security.done.twoFactor',
      todoKey: 'account.security.todo.twoFactor',
      href: '#security',
    },
    {
      id: 'passkeys',
      weight: 25,
      met: status.passkeysCount > 0,
      doneKey: 'account.security.done.passkeys',
      todoKey: 'account.security.todo.passkeys',
      href: '#passkeys',
      vars: { count: status.passkeysCount },
    },
    {
      id: 'password',
      weight: 20,
      met: status.hasPassword,
      doneKey: 'account.security.done.password',
      todoKey: 'account.security.todo.password',
      href: '#security',
    },
    {
      id: 'wallets',
      weight: 15,
      met: status.walletsCount > 0,
      doneKey: 'account.security.done.wallets',
      todoKey: 'account.security.todo.wallets',
      href: '#wallets',
      vars: { count: status.walletsCount },
    },
    {
      id: 'email',
      weight: 10,
      met: status.emailVerified,
      doneKey: 'account.security.done.email',
      todoKey: 'account.security.todo.email',
      href: '#profile',
    },
  ]
}

export function ProtectionSummary({ status }: { status: SecurityStatus }) {
  const t = useT()
  const all = measures(status)
  const score = all.reduce((sum, m) => (m.met ? sum + m.weight : sum), 0)
  const done = all.filter((m) => m.met)
  const todo = all.filter((m) => !m.met)

  const tone =
    score >= 80
      ? { bar: 'var(--success)', label: t('account.security.score.strong') }
      : score >= 50
        ? { bar: 'var(--warning)', label: t('account.security.score.fair') }
        : { bar: 'var(--danger)', label: t('account.security.score.weak') }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-overlay)]/40 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-[var(--text)]">
          {t('account.security.score')}
        </span>
        <span className="text-xs font-medium" style={{ color: tone.bar }}>
          {tone.label}
        </span>
      </div>

      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-overlay)]"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('account.security.score')}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${score}%`, backgroundColor: tone.bar }}
        />
      </div>

      {todo.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
            {t('account.security.todo')}
          </p>
          <ul className="mt-2 space-y-1">
            {todo.map((m) => (
              <li key={m.id}>
                <a
                  href={m.href}
                  className="group flex items-center justify-between gap-3 rounded px-2 py-1.5 -mx-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--bg-overlay)]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                    <span className="truncate">{t(m.todoKey)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--text-faint)]">
                    +{m.weight}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {done.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {done.map((m) => (
            <Badge
              key={m.id}
              variant="success"
              icon={<Check className="h-2.5 w-2.5" aria-hidden="true" />}
            >
              {t(m.doneKey, m.vars)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
