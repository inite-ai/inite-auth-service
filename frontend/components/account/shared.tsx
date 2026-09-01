'use client'

import { ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui'

/**
 * Building blocks shared by every account section.
 *
 * These exist because each section used to hand-roll the same three
 * layouts — a labelled row with a trailing action, an empty state, and a
 * failure state — and drifted apart in the process (five icon-chip
 * gradients, three button shapes, delete affordances that only appeared on
 * hover). Everything here is flat, token-driven, and reachable by touch and
 * keyboard, matching the primitives in `components/ui`.
 */

/**
 * Scroll target for the in-page section nav. `scroll-mt` clears the sticky
 * app header so an anchored section doesn't land underneath it.
 */
export function SectionAnchor({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      {children}
    </section>
  )
}

/**
 * Icon + title + description, with an action pinned to the trailing edge.
 *
 * The action is ALWAYS rendered visible. The previous rows revealed their
 * destructive control with `opacity-0 group-hover:opacity-100`, which made
 * revoking a session, passkey, or wallet impossible on touch devices and
 * invisible to keyboard users who had focused it.
 */
export function Row({
  icon,
  title,
  description,
  action,
  tone = 'default',
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  tone?: 'default' | 'danger'
}) {
  const border =
    tone === 'danger'
      ? 'border-[color:var(--danger)]/30 bg-[color:var(--danger)]/5'
      : 'border-[var(--border)] bg-[var(--bg-overlay)]/40'

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border ${border} px-3 py-2.5`}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && (
          <span
            className={`mt-0.5 shrink-0 ${
              tone === 'danger'
                ? 'text-[color:var(--danger)]'
                : 'text-[var(--text-faint)]'
            }`}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text)]">{title}</p>
          {description && (
            <div className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</div>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** Nothing-here state: what is missing, and why the reader might want it. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <span
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-overlay)] text-[var(--text-faint)]"
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className="text-sm font-medium text-[var(--text)]">{title}</p>
      {hint && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-[var(--text-muted)]">
          {hint}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/**
 * A section that failed to load, with a retry.
 *
 * The account page used to answer any load failure by clearing the stored
 * token and bouncing to /login — a flaky request signed the user out. A
 * section that cannot load now says so and offers to try again.
 */
export function SectionError({
  title,
  message,
  retryLabel,
  onRetry,
}: {
  title: string
  message?: string
  retryLabel: string
  onRetry: () => void
}) {
  return (
    <div className="rounded-md border border-[color:var(--danger)]/30 bg-[color:var(--danger)]/5 px-3 py-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--danger)]"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text)]">{title}</p>
          {message && (
            <p className="mt-0.5 break-words text-xs text-[var(--text-muted)]">{message}</p>
          )}
          <Button
            variant="secondary"
            size="sm"
            block={false}
            className="mt-2.5"
            icon={<RotateCw className="h-3 w-3" aria-hidden="true" />}
            onClick={onRetry}
          >
            {retryLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Advisory note inside a section — context, never an error. */
export function Note({
  tone = 'info',
  icon,
  children,
}: {
  tone?: 'info' | 'warning'
  icon?: ReactNode
  children: ReactNode
}) {
  const styles =
    tone === 'warning'
      ? 'border-[color:var(--warning)]/30 bg-[color:var(--warning)]/5 text-[color:var(--warning)]'
      : 'border-[color:var(--accent)]/25 bg-[var(--accent-faint)] text-[var(--accent)]'

  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 ${styles}`}>
      {icon && (
        <span className="mt-0.5 shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="text-xs leading-relaxed">{children}</div>
    </div>
  )
}

/**
 * Coerce a list response into an array.
 *
 * The list endpoints return arrays, but nothing downstream verified it, so a
 * non-array body — an error envelope, a proxy's HTML page, a future
 * `{items:[]}` wrapper — reached `.map()`/`.some()` and threw inside render.
 * With no error boundary above these sections that took the whole page down.
 * An unexpected shape now degrades to an empty list instead.
 */
export function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/**
 * Relative time in whole days, falling back to an absolute date past a
 * week. Sessions previously rendered "Expires 9/8/2026" next to "Expires in
 * 6 days" in the same list; this keeps one voice.
 */
export function formatRelativeDays(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  const days = Math.round((date.getTime() - Date.now()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 1 && days < 7) return `in ${days} days`
  if (days < -1 && days > -7) return `${Math.abs(days)} days ago`
  return date.toLocaleDateString()
}

/** Coarse device label parsed from a user-agent string. */
export function describeUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null
  const platform = /iPhone|iPad|iPod/i.test(ua)
    ? 'iOS'
    : /Android/i.test(ua)
      ? 'Android'
      : /Macintosh|Mac OS/i.test(ua)
        ? 'macOS'
        : /Windows/i.test(ua)
          ? 'Windows'
          : /Linux/i.test(ua)
            ? 'Linux'
            : null
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null

  if (platform && browser) return `${browser} on ${platform}`
  return browser ?? platform
}
