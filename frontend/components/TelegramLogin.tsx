'use client'

import { useEffect, useRef, useState } from 'react'
import { OAuthParams, buildPassthroughHref } from '@/lib/oauthHelpers'
import { useLocale } from '@/lib/i18n'
import {
  TELEGRAM_WIDGET_SRC,
  TelegramStart,
  isOwnCallback,
  widgetAttributes,
} from '@/lib/telegramWidget'

interface TelegramLoginProps {
  oauthParams: OAuthParams
  /** Told once whether this client has a Telegram bot, so the divider can show. */
  onAvailable?: (available: boolean) => void
}

/**
 * «Sign in with Telegram» for the /authorize in flight, when its client has a
 * bot bound in TELEGRAM_BOTS. Asks /bots whether there is one, then /start
 * (with the authorize params, so the flow resumes after the round-trip) for
 * the widget's callback and state cookie, and mounts Telegram's own widget.
 * Renders nothing when Telegram sign-in is off or the client has no bot.
 */
export default function TelegramLogin({ oauthParams, onAvailable }: TelegramLoginProps) {
  const { locale } = useLocale()
  const box = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState<TelegramStart | null>(null)
  const clientId = oauthParams.clientId

  useEffect(() => {
    let cancelled = false
    if (!clientId) {
      onAvailable?.(false)
      return
    }
    ;(async () => {
      try {
        const bots = await fetch(
          `/v1/auth/telegram/bots?client_id=${encodeURIComponent(clientId)}`,
          { credentials: 'include' },
        ).then((r) => (r.ok ? r.json() : { bots: [] }))
        const bot = Array.isArray(bots?.bots) ? bots.bots[0] : undefined
        if (!bot) {
          if (!cancelled) onAvailable?.(false)
          return
        }
        const href = buildPassthroughHref('/v1/auth/telegram/start', oauthParams)
        const sep = href.includes('?') ? '&' : '?'
        const res = await fetch(`${href}${sep}bot=${encodeURIComponent(bot.name)}`, {
          credentials: 'include',
        })
        const data = res.ok ? ((await res.json()) as TelegramStart) : null
        if (cancelled) return
        if (data && isOwnCallback(data.auth_url, window.location.origin)) {
          setStart(data)
          onAvailable?.(true)
        } else {
          onAvailable?.(false)
        }
      } catch {
        if (!cancelled) onAvailable?.(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // The authorize params do not change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  useEffect(() => {
    const el = box.current
    if (!el || !start) return
    const script = document.createElement('script')
    script.async = true
    script.src = TELEGRAM_WIDGET_SRC
    for (const [k, v] of Object.entries(widgetAttributes(start, locale))) {
      script.setAttribute(k, v)
    }
    el.replaceChildren(script)
    return () => {
      el.replaceChildren()
    }
  }, [start, locale])

  if (!start) return null
  return <div ref={box} className="flex justify-center min-h-[40px]" data-testid="telegram-login" />
}
