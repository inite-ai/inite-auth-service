'use client'

import { Globe } from 'lucide-react'
import { useLocale, LOCALES, type LocaleCode } from '@/lib/i18n'

/**
 * Compact locale switcher. Pill of flag-buttons for ≤ 4 locales;
 * once we have more we'll swap this for a `<select>` so the layout
 * doesn't blow out.
 */
export function LocaleSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useLocale()
  const codes = Object.keys(LOCALES) as LocaleCode[]

  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center gap-1 p-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 ${className}`}
    >
      <Globe className="w-4 h-4 text-gray-400 ml-1" aria-hidden="true" />
      {codes.map((code) => {
        const active = code === locale
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={active}
            aria-label={LOCALES[code].label}
            className={`px-2 py-1 text-xs rounded-md transition ${
              active
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <span aria-hidden="true">{LOCALES[code].flag}</span>{' '}
            <span className="uppercase">{code}</span>
          </button>
        )
      })}
    </div>
  )
}
