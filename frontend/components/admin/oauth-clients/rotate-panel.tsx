'use client'

import { useState, useEffect } from 'react'
import { Check, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Sheet } from '@/components/ui'
import { OAuthClient } from './types'
import { FieldLabel } from './shared'

export function RotateSecretPanel({
  client,
  onClose,
  config,
  onRotated,
}: {
  client: OAuthClient | null
  onClose: () => void
  config: any
  onRotated: (secret: string) => void
}) {
  const [force, setForce] = useState(false)
  const [graceHours, setGraceHours] = useState(24)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (client) {
      setForce(false)
      setGraceHours(24)
    }
  }, [client])

  if (!client) {
    return (
      <Sheet open={false} onClose={onClose} title="">
        <></>
      </Sheet>
    )
  }

  const submit = async () => {
    setBusy(true)
    try {
      const body: any = { force }
      if (!force) {
        body.graceWindowSeconds = Math.max(0, Math.min(7 * 24, graceHours)) * 3600
      }
      const res = await api.post(
        `/admin/oauth-clients/${client.clientId}/rotate-secret`,
        body,
        config,
      )
      toast.success(
        force
          ? 'Secret rotated; previous secret revoked immediately'
          : `Secret rotated; previous secret accepted for ${graceHours}h`,
      )
      onRotated(res.data.clientSecret)
    } catch {
      toast.error('Rotation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title="Rotate client secret"
      subtitle={client.clientId}
      width="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-8 px-3 text-xs rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[color:var(--warning)] text-black hover:bg-[color:var(--warning)]/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Rotate
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setForce(!force)}
          className={`w-full flex items-start gap-2.5 p-3 rounded-md border text-left transition-colors ${
            force
              ? 'bg-[color:var(--danger)]/10 border-[color:var(--danger)]/40'
              : 'bg-[var(--bg)] border-[var(--border)] hover:border-[var(--border-strong)]'
          }`}
        >
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
              force
                ? 'bg-[color:var(--danger)] border-[color:var(--danger)]'
                : 'border-[var(--border-strong)]'
            }`}
          >
            {force && <Check className="w-3 h-3 text-white" />}
          </div>
          <div>
            <div className="text-xs font-medium text-[var(--text)]">
              Revoke previous secret immediately
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Use when the old secret is known to be compromised. Callers
              using the old secret will start failing right away.
            </div>
          </div>
        </button>

        {!force && (
          <div>
            <FieldLabel
              label={`Grace window: ${graceHours}h`}
              hint="previous secret still works for this long"
            />
            <input
              type="range"
              min={1}
              max={168}
              step={1}
              value={graceHours}
              onChange={(e) => setGraceHours(parseInt(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-faint)] mt-1">
              <span>1h</span>
              <span>24h</span>
              <span>7d</span>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}
