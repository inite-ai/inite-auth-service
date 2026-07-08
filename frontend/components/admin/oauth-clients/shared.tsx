'use client'

import { useState, ChangeEvent } from 'react'
import { Check, X, Trash2, Plus } from 'lucide-react'
import { Badge } from '@/components/ui'
import { GRANT_OPTIONS } from './types'

interface ChipOption {
  value: string
  label: string
  count?: number
}

export function FilterChipGroup({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: ChipOption[]
}) {
  return (
    <div className="inline-flex p-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md">
      {options.map((o) => {
        const active = o.value === value
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
            {o.label}
            {typeof o.count === 'number' && (
              <span
                className={`text-[10px] font-mono ${
                  active ? 'text-[var(--text-muted)]' : 'text-[var(--text-faint)]'
                }`}
              >
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function FieldLabel({
  label,
  hint,
}: {
  label: string
  hint?: string
}) {
  return (
    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
      {label}
      {hint && (
        <span className="ml-2 text-[var(--text-faint)] font-normal">
          {hint}
        </span>
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
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  mono?: boolean
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full h-9 px-3 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 ${
        mono ? 'font-mono' : ''
      }`}
    />
  )
}

export function GrantPicker({
  selected,
  onToggle,
}: {
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="space-y-1.5">
      {GRANT_OPTIONS.map((g) => {
        const checked = selected.includes(g.id)
        return (
          <button
            type="button"
            key={g.id}
            onClick={() => onToggle(g.id)}
            className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-md border text-left transition-colors ${
              checked
                ? 'bg-[var(--accent-faint)] border-[color:var(--accent)]/40'
                : 'bg-[var(--bg)] border-[var(--border)] hover:border-[var(--border-strong)]'
            }`}
          >
            <div
              className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                checked
                  ? 'bg-[var(--accent)] border-[var(--accent)]'
                  : 'border-[var(--border-strong)]'
              }`}
            >
              {checked && <Check className="w-3 h-3 text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono text-[var(--text)]">{g.id}</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {g.hint}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

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
  const remove = (v: string) => onChange(values.filter((x) => x !== v))

  return (
    <div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {values.map((v) => (
            <Badge key={v} variant={variant} mono>
              {v}
              <button
                type="button"
                onClick={() => remove(v)}
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
            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
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

export function RedirectUris({
  values,
  onChange,
}: {
  values: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="space-y-1.5">
      {values.map((uri, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="url"
            value={uri}
            onChange={(e) => {
              const next = [...values]
              next[i] = e.target.value
              onChange(next)
            }}
            placeholder="https://app.example.com/callback"
            className="flex-1 h-8 px-2.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 font-mono"
          />
          <button
            type="button"
            onClick={() => onChange(values.filter((_, idx) => idx !== i))}
            className="p-1.5 text-[var(--text-faint)] hover:text-[color:var(--danger)] rounded-md transition-colors"
            aria-label="Remove URI"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...values, ''])}
        className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)] inline-flex items-center gap-1"
      >
        <Plus className="w-3 h-3" />
        Add URI
      </button>
    </div>
  )
}
