/**
 * Telegram Login Widget on the login page.
 *
 * The widget is Telegram's own script (https://core.telegram.org/widgets/login):
 * it draws the button in an iframe and, once the person confirms in Telegram,
 * sends the browser to `data-auth-url` with the signed fields. That URL comes
 * from /v1/auth/telegram/start and is on this page's own host, because
 * Telegram refuses a widget on any page but its bot's /setdomain («Bot domain
 * invalid») and the state cookie /start sets here only returns to this host.
 *
 * No imports: the root jest suite tests it
 * (test/login-page-widget.spec.ts).
 */

export const TELEGRAM_WIDGET_SRC = 'https://telegram.org/js/telegram-widget.js?22'

export interface TelegramStart {
  bot_username: string
  auth_url: string
}

/** The `data-*` attributes of the widget's <script>, for a redirect sign-in. */
export function widgetAttributes(start: TelegramStart, lang?: string): Record<string, string> {
  const attrs: Record<string, string> = {
    'data-telegram-login': start.bot_username,
    'data-size': 'large',
    'data-radius': '6',
    'data-auth-url': start.auth_url,
  }
  // The widget's own label language; it knows en, ru, pt-br and es among others.
  const code = (lang ?? '').toLowerCase().slice(0, 2)
  if (code === 'pt') attrs['data-lang'] = 'pt-br'
  else if (code) attrs['data-lang'] = code
  return attrs
}

/**
 * The auth_url /start gave must be on this page's host and our callback path:
 * anything else would send the signed fields somewhere we did not choose.
 */
export function isOwnCallback(authUrl: string, pageOrigin: string): boolean {
  try {
    const url = new URL(authUrl)
    return url.origin === pageOrigin && url.pathname === '/v1/auth/telegram/callback'
  } catch {
    return false
  }
}
