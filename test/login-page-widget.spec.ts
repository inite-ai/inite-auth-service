import { isOwnCallback, widgetAttributes } from '../frontend/lib/telegramWidget'

/**
 * The login page's Telegram widget: Telegram accepts it only on the bot's
 * /setdomain host, and its redirect must come back to our own callback on
 * that host, or the state cookie set by /start never returns with it.
 */
describe('Telegram widget on the login page', () => {
  const start = {
    bot_username: 'floripa_ru_bot',
    auth_url: 'https://auth.inite.ai/v1/auth/telegram/callback?tg_state=abc',
  }

  it("names the client's bot and redirects to the callback /start gave", () => {
    const attrs = widgetAttributes(start, 'ru')
    expect(attrs['data-telegram-login']).toBe('floripa_ru_bot')
    expect(attrs['data-auth-url']).toBe(start.auth_url)
    expect(attrs['data-lang']).toBe('ru')
  })

  it("speaks the page's language, Brazilian Portuguese for pt", () => {
    expect(widgetAttributes(start, 'pt-BR')['data-lang']).toBe('pt-br')
    expect(widgetAttributes(start, 'es')['data-lang']).toBe('es')
    expect(widgetAttributes(start)['data-lang']).toBeUndefined()
  })

  it('accepts only our callback on the same host as the page', () => {
    expect(isOwnCallback(start.auth_url, 'https://auth.inite.ai')).toBe(true)
    // The API host: Telegram would refuse the widget and the cookie would not return.
    expect(
      isOwnCallback('https://auth-api.inite.ai/v1/auth/telegram/callback?tg_state=abc', 'https://auth.inite.ai'),
    ).toBe(false)
    expect(isOwnCallback('https://evil.example/v1/auth/telegram/callback', 'https://auth.inite.ai')).toBe(false)
    expect(isOwnCallback('https://auth.inite.ai/elsewhere', 'https://auth.inite.ai')).toBe(false)
    expect(isOwnCallback('not a url', 'https://auth.inite.ai')).toBe(false)
  })
})
