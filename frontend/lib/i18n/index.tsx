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
 * 1. Create `lib/i18n/<code>.ts` exporting a `Partial<Dict>`.
 * 2. Register it in {@link LOCALES} below.
 * 3. That's it — the switcher and provider pick it up automatically.
 */

export type LocaleCode = 'en' | 'ru'

export const LOCALES: Record<
  LocaleCode,
  { label: string; flag: string; dict: Partial<Dict> }
> = {
  en: { label: 'English', flag: '🇺🇸', dict: en },
  ru: { label: 'Русский', flag: '🇷🇺', dict: ru },
}

const COOKIE = 'inite.locale'
const MAX_AGE = 60 * 60 * 24 * 365

interface LocaleCtx {
  locale: LocaleCode
  setLocale: (code: LocaleCode) => void
  t: (key: TKey, vars?: Record<string, string | number>) => string
}

const Ctx = createContext<LocaleCtx | null>(null)

function readCookie(): LocaleCode | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE}=([^;]+)`),
  )
  if (!match) return null
  const code = decodeURIComponent(match[1] ?? '')
  return code === 'en' || code === 'ru' ? code : null
}

function detectInitial(): LocaleCode {
  const fromCookie = readCookie()
  if (fromCookie) return fromCookie
  if (typeof navigator === 'undefined') return 'en'
  const browser = navigator.language?.split('-')[0]
  return browser === 'ru' ? 'ru' : 'en'
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
    if (typeof document !== 'undefined') {
      document.cookie = `${COOKIE}=${code}; path=/; max-age=${MAX_AGE}; SameSite=Lax`
    }
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
