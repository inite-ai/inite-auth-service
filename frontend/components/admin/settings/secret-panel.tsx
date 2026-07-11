'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import type { AxiosRequestConfig } from 'axios'
import api from '@/lib/api'
import { Sheet } from '@/components/ui'
import { SettingView } from './types'

/**
 * Editor for a secret setting (e.g. the mTLS trusted CA PEM). The current value
 * is never returned by the API, so this is write-only: paste to replace.
 */
export default function SecretPanel({
  setting,
  config,
  onClose,
  onSaved,
}: {
  setting: SettingView | null
  config: AxiosRequestConfig
  onClose: () => void
  onSaved: () => void
}) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (setting) setValue('')
  }, [setting])

  const save = async () => {
    if (!setting) return
    if (!value.trim()) return toast.error('Paste a value')
    setSaving(true)
    try {
      await api.put(`/admin/settings/${setting.key}`, { value }, config)
      toast.success(`${setting.label} updated`)
      onSaved()
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      toast.error(msg ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={!!setting}
      onClose={() => !saving && onClose()}
      title={setting?.label ?? ''}
      subtitle={setting?.key}
      width="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-8 px-3 text-xs rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-[var(--text-muted)]">{setting?.description}</p>
        <p className="text-[11px] text-[var(--text-faint)]">
          The stored value is encrypted and never shown. Pasting here replaces it;
          leave the feature reset to fall back to the environment value.
        </p>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={10}
          placeholder={'-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----'}
          className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border-strong)] rounded-md text-xs font-mono text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 resize-y"
        />
      </div>
    </Sheet>
  )
}
