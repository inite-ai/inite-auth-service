'use client'

import { useState } from 'react'
import { Globe, Check } from 'lucide-react'
import { useLocale, LOCALES, type LocaleCode } from '@/lib/i18n'

/**
 * Compact locale switcher — popover with the current code visible
 * and a dropdown of options. Matches the dense Linear-style header.
 */
export function LocaleSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useLocale()
  const [open, setOpen] = useState(false)
  const codes = Object.keys(LOCALES) as LocaleCode[]

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        aria-label="Language"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 h-8 px-2 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-overlay)] transition-colors"
      >
        <Globe className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="uppercase tracking-wide">{locale}</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1 z-50 min-w-[10rem] py-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md shadow-lg"
        >
          {codes.map((code) => {
            const active = code === locale
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setLocale(code)
                  setOpen(false)
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--bg-overlay)] text-left"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true">{LOCALES[code].flag}</span>
                  <span>{LOCALES[code].label}</span>
                </span>
                {active && <Check className="w-3 h-3 text-[var(--accent)]" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
