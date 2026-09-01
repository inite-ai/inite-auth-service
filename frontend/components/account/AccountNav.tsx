'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import type { TKey } from '@/lib/i18n'

/** Section anchors, in the order the page renders them. */
const SECTIONS: readonly { id: string; labelKey: TKey }[] = [
  { id: 'profile', labelKey: 'account.profile.title' },
  { id: 'security', labelKey: 'account.security.title' },
  { id: 'passkeys', labelKey: 'account.passkeys.title' },
  { id: 'wallets', labelKey: 'account.wallets.title' },
  { id: 'sessions', labelKey: 'account.sessions.title' },
  { id: 'activity', labelKey: 'account.activity.title' },
  { id: 'data', labelKey: 'account.data.title' },
]

/**
 * Sticky in-page section nav.
 *
 * The page is a long single column of independent concerns, and previously
 * the only way from "my protection score is low" to "add a passkey" was to
 * scroll past two screens of sign-in history. Desktop gets a persistent rail
 * that also shows where you are; on narrow screens it collapses away rather
 * than eating the viewport, since thumb-scrolling a phone is cheap.
 */
export function AccountNav() {
  const t = useT()
  const [active, setActive] = useState(SECTIONS[0]!.id)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible?.target.id) setActive(visible.target.id)
      },
      // Bias the band towards the top so the highlighted item is the one the
      // reader has just arrived at, not whatever happens to be centred.
      { rootMargin: '-72px 0px -55% 0px', threshold: 0 },
    )

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <nav aria-label={t('account.title')} className="sticky top-20 hidden lg:block">
      <ul className="space-y-0.5">
        {SECTIONS.map(({ id, labelKey }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={active === id ? 'true' : undefined}
              className={`block rounded-md px-2 py-1.5 text-xs transition-colors ${
                active === id
                  ? 'bg-[var(--bg-overlay)] font-medium text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-overlay)]/60 hover:text-[var(--text)]'
              }`}
            >
              {t(labelKey)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
