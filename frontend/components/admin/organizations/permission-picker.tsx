'use client'

import { useState } from 'react'
import { CheckRow } from '@/components/admin/form-controls'
import { PERMISSION_PRESETS } from './types'

/** Checkbox catalog of known org permissions + a free-form custom scope adder.
 *  Shared by the create and edit role forms. */
export function PermissionPicker({
  values,
  onChange,
}: {
  values: string[]
  onChange: (next: string[]) => void
}) {
  const [custom, setCustom] = useState('')
  const toggle = (p: string) =>
    onChange(values.includes(p) ? values.filter((x) => x !== p) : [...values, p])
  const addCustom = () => {
    const v = custom.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setCustom('')
  }
  const customValues = values.filter((v) => !PERMISSION_PRESETS.includes(v))

  return (
    <div className="space-y-1.5">
      {[...PERMISSION_PRESETS, ...customValues].map((p) => (
        <CheckRow
          key={p}
          checked={values.includes(p)}
          onToggle={() => toggle(p)}
          label={p}
          mono
        />
      ))}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustom()
            }
          }}
          placeholder="custom scope e.g. org:billing:manage"
          className="flex-1 h-8 px-2.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 font-mono"
        />
        <button
          type="button"
          onClick={addCustom}
          className="h-8 px-2.5 text-xs rounded-md bg-[var(--bg-overlay)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  )
}
