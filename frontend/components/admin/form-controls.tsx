'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Badge } from '@/components/ui'

/** Relative "3m ago" formatting shared across admin tables. */
export function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime()
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

export function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
      {label}
      {hint && (
        <span className="ml-2 text-[var(--text-faint)] font-normal">{hint}</span>
      )}
    </label>
  )
}

export function TextField({
  value,
  onChange,
  placeholder,
  mono = false,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full h-9 px-3 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 ${
        mono ? 'font-mono' : ''
      }`}
    />
  )
}

/** A pill-group single-select. Options carry a value + label (+ optional icon). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T
  options: Array<{ value: T; label: string; icon?: typeof Check }>
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div
      className={`inline-flex p-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`h-7 px-2.5 inline-flex items-center gap-1.5 text-xs rounded transition-colors ${
              active
                ? 'bg-[var(--bg-overlay)] text-[var(--text)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Free-form tag input with optional quick-add presets. */
export function ChipInput({
  values,
  onChange,
  presets,
  placeholder,
  variant = 'accent',
}: {
  values: string[]
  onChange: (next: string[]) => void
  presets?: string[]
  placeholder?: string
  variant?: 'accent' | 'warning'
}) {
  const [input, setInput] = useState('')
  const add = (raw: string) => {
    const v = raw.trim()
    if (!v || values.includes(v)) return
    onChange([...values, v])
  }
  return (
    <div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {values.map((v) => (
            <Badge key={v} variant={variant} mono>
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                className="hover:text-[var(--text)] -mr-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(input)
              setInput('')
            }
          }}
          placeholder={placeholder}
          className="flex-1 h-8 px-2.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 font-mono"
        />
        <button
          type="button"
          onClick={() => {
            add(input)
            setInput('')
          }}
          className="h-8 px-2.5 text-xs rounded-md bg-[var(--bg-overlay)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          Add
        </button>
      </div>
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {presets
            .filter((p) => !values.includes(p))
            .map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => add(p)}
                className="px-1.5 py-0.5 text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--bg-overlay)] rounded border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors font-mono"
              >
                + {p}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

/** A checkable option row (checkbox + label + optional hint). */
export function CheckRow({
  checked,
  onToggle,
  label,
  hint,
  mono = false,
}: {
  checked: boolean
  onToggle: () => void
  label: string
  hint?: string
  mono?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-md border text-left transition-colors ${
        checked
          ? 'bg-[var(--accent-faint)] border-[color:var(--accent)]/40'
          : 'bg-[var(--bg-elevated)] border-[var(--border)] hover:border-[var(--border-strong)]'
      }`}
    >
      <span
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 ${
          checked
            ? 'bg-[var(--accent)] border-[var(--accent)]'
            : 'border-[var(--border-strong)]'
        }`}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </span>
      <span className="min-w-0">
        <span className={`block text-xs font-medium text-[var(--text)] ${mono ? 'font-mono' : ''}`}>
          {label}
        </span>
        {hint && (
          <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
            {hint}
          </span>
        )}
      </span>
    </button>
  )
}
