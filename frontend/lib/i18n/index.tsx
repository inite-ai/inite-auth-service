'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { en, type Dict, type TKey } from './dictionary'
import { ru } from './ru'
import { pt } from './pt'
import { es } from './es'

/**
 * Self-contained i18n provider. No external dependency — small enough
 * to keep, expressive enough to ship. Switch via {@link useLocale},
 * translate via {@link useT}.
 *
 * Locale is persisted in a cookie so a subsequent request from the
 * same browser hydrates with the user's preference (works with SSR
 * once the cookie is read on the server side; here it's a CSR-only
 * convenience).
 *
 * Adding a language:
 * 1. Create `lib/i18n/<code>.ts` and `lib/i18n/account/<code>.ts`, each
 *    exporting a `Partial<Dict>` (the split keeps files under the size gate).
 * 2. Register it in {@link LOCALES} below.
 * 3. That's it — the switcher and provider pick it up automatically.
 */

export type LocaleCode = 'en' | 'ru' | 'pt' | 'es'

export const LOCALES: Record<
  LocaleCode,
  { label: string; flag: string; dict: Partial<Dict> }
> = {
  en: { label: 'English', flag: '🇺🇸', dict: en },
  ru: { label: 'Русский', flag: '🇷🇺', dict: ru },
  pt: { label: 'Português', flag: '🇧🇷', dict: pt },
  es: { label: 'Español', flag: '🇲🇽', dict: es },
}

const COOKIE = 'inite.locale'
const MAX_AGE = 60 * 60 * 24 * 365

interface LocaleCtx {
  locale: LocaleCode
  setLocale: (code: LocaleCode) => void
  t: (key: TKey, vars?: Record<string, string | number>) => string
}

const Ctx = createContext<LocaleCtx | null>(null)

function isLocaleCode(code: string): code is LocaleCode {
  return Object.prototype.hasOwnProperty.call(LOCALES, code)
}

/**
 * First supported locale in a list of BCP 47 tags, matched on the primary
 * subtag: `pt-BR` → `pt`, `es-419` → `es`. Used for both the OIDC
 * `ui_locales` param (space-separated, preference order) and
 * `navigator.languages`.
 */
export function pickLocale(tags: ReadonlyArray<string>): LocaleCode | null {
  for (const tag of tags) {
    const primary = tag.trim().toLowerCase().split(/[-_]/)[0] ?? ''
    if (isLocaleCode(primary)) return primary
  }
  return null
}

function writeCookie(code: LocaleCode): void {
  if (typeof document === 'undefined') return
  document.cookie = `${COOKIE}=${code}; path=/; max-age=${MAX_AGE}; SameSite=Lax`
}

function readCookie(): LocaleCode | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE}=([^;]+)`),
  )
  if (!match) return null
  const code = decodeURIComponent(match[1] ?? '')
  return isLocaleCode(code) ? code : null
}

/**
 * OIDC `ui_locales` (Core §3.1.2.1): the relying party says which language
 * the person was just reading. /authorize carries it onto /login and
 * /consent; any page that sees it in its own URL honours it.
 */
function readUiLocales(): LocaleCode | null {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get('ui_locales')
  return raw ? pickLocale(raw.split(/\s+/)) : null
}

/** ui_locales → cookie → browser languages → en. */
function detectInitial(): LocaleCode {
  const fromRp = readUiLocales()
  if (fromRp) {
    // Persist it: the next hops (magic-link landing, consent, account)
    // carry no ui_locales of their own and fall back to the cookie.
    writeCookie(fromRp)
    return fromRp
  }
  const fromCookie = readCookie()
  if (fromCookie) return fromCookie
  if (typeof navigator === 'undefined') return 'en'
  const browser = navigator.languages?.length
    ? navigator.languages
    : [navigator.language ?? '']
  return pickLocale(browser) ?? 'en'
}

function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  )
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>('en')

  // Read locale from cookie / navigator after mount. SSR sees 'en'
  // and the client swaps on hydration — acceptable for a content-
  // marketing surface; we'll wire SSR cookie reading when we ship
  // server components that need translated strings.
  useEffect(() => {
    setLocaleState(detectInitial())
  }, [])

  const setLocale = useCallback((code: LocaleCode) => {
    setLocaleState(code)
    writeCookie(code)
  }, [])

  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>): string => {
      const dict = LOCALES[locale]?.dict ?? {}
      const raw = (dict as Partial<Dict>)[key] ?? en[key]
      return interpolate(raw, vars)
    },
    [locale],
  )

  const value = useMemo<LocaleCtx>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLocale() {
  const ctx = useContext(Ctx)
  if (!ctx) {
    // Avoid the React error overlay if a server-rendered branch
    // renders without the provider; return a no-op shim.
    return {
      locale: 'en' as LocaleCode,
      setLocale: () => undefined,
      t: ((key: TKey) => en[key]) as LocaleCtx['t'],
    }
  }
  return ctx
}

/** Shorthand when you only need the translation function. */
export function useT() {
  return useLocale().t
}

export type { TKey, Dict } from './dictionary'
