'use client'

import { useState } from 'react'
import { Loader2, RotateCcw, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import type { AxiosRequestConfig } from 'axios'
import api from '@/lib/api'
import { Badge } from '@/components/ui'
import { TextField } from '../form-controls'
import { SettingView, SettingSource } from './types'

function SourceBadge({ source }: { source: SettingSource }) {
  if (source === 'db') return <Badge variant="accent">override</Badge>
  if (source === 'env') return <Badge variant="warning">env</Badge>
  return <Badge variant="neutral">default</Badge>
}

export default function SettingRow({
  setting,
  config,
  onChanged,
  onEditSecret,
}: {
  setting: SettingView
  config: AxiosRequestConfig
  onChanged: () => void
  onEditSecret: (s: SettingView) => void
}) {
  const [draft, setDraft] = useState(setting.value ?? '')
  const [busy, setBusy] = useState(false)
  const dirty = !setting.secret && draft !== (setting.value ?? '')

  const put = async (value: string) => {
    setBusy(true)
    try {
      await api.put(`/admin/settings/${setting.key}`, { value }, config)
      toast.success(`${setting.label} updated`)
      onChanged()
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      toast.error(msg ?? 'Failed to update setting')
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    setBusy(true)
    try {
      await api.delete(`/admin/settings/${setting.key}`, config)
      toast.success(`${setting.label} reset to env`)
      onChanged()
    } catch {
      toast.error('Failed to reset setting')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-start gap-4 px-4 py-3 border-b border-[var(--border)] last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-[var(--text)]">{setting.label}</span>
          <SourceBadge source={setting.source} />
          {setting.source === 'db' && (
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              aria-label="Reset to environment default"
              title="Reset to environment default"
              className="p-0.5 text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-40"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{setting.description}</p>
        <code className="mt-0.5 block text-[10px] font-mono text-[var(--text-faint)]">{setting.key}</code>
      </div>

      <div className="shrink-0 flex items-center gap-2 pt-0.5">
        {setting.type === 'flag' ? (
          <Toggle
            on={setting.value === 'true'}
            busy={busy}
            onToggle={() => put(setting.value === 'true' ? 'false' : 'true')}
          />
        ) : setting.secret ? (
          <button
            type="button"
            onClick={() => onEditSecret(setting)}
            className="h-8 px-3 text-xs rounded-md border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--bg-overlay)]"
          >
            {setting.isSet ? 'Update' : 'Set'}
          </button>
        ) : (
          <div className="flex items-center gap-1.5 w-56">
            <div className="flex-1">
              <TextField value={draft} onChange={setDraft} mono placeholder="unset" />
            </div>
            <button
              type="button"
              onClick={() => put(draft)}
              disabled={busy || !dirty}
              aria-label="Save"
              title="Save"
              className="h-9 w-9 inline-flex items-center justify-center rounded-md bg-[var(--accent)] text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Toggle({ on, busy, onToggle }: { on: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      role="switch"
      aria-checked={on}
      aria-label="Toggle setting"
      className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-[var(--accent)]' : 'bg-[var(--bg-overlay)]'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  )
}
