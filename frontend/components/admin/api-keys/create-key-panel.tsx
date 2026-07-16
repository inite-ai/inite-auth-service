'use client'

import { useState, useEffect } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Sheet } from '@/components/ui'
import { FieldLabel, TextField, ChipInput } from '../form-controls'

interface CreateForm {
  name: string
  companyId: string
  audience: string
  scopes: string[]
  expiresInDays: string
}

function initialForm(): CreateForm {
  return {
    name: '',
    companyId: '',
    audience: 'brain',
    scopes: ['brain:read', 'brain:write'],
    expiresInDays: '',
  }
}

export default function CreateKeyPanel({
  open,
  onClose,
  config,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  config: any
  onCreated: (rawKey: string) => void
}) {
  const [form, setForm] = useState<CreateForm>(initialForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm(initialForm())
  }, [open])

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    if (!form.audience.trim()) {
      toast.error('Audience is required')
      return
    }
    if (form.scopes.length === 0) {
      toast.error('Add at least one scope')
      return
    }
    const days = form.expiresInDays.trim() ? Number(form.expiresInDays) : undefined
    if (days !== undefined && (!Number.isInteger(days) || days < 1)) {
      toast.error('Expiry must be a positive number of days')
      return
    }
    setSaving(true)
    try {
      const res = await api.post(
        '/admin/api-keys',
        {
          name: form.name.trim(),
          ...(form.companyId.trim() ? { companyId: form.companyId.trim() } : {}),
          audience: form.audience.trim(),
          scopes: form.scopes,
          ...(days !== undefined ? { expiresInDays: days } : {}),
        },
        config,
      )
      toast.success('API key issued')
      onCreated(res.data.rawKey as string)
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to issue API key')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => !saving && onClose()}
      title="New API key"
      width="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-8 px-3 text-xs rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Issue key
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <FieldLabel label="Name" hint="what this key is for" />
          <TextField
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            placeholder="brain ingest — acme production"
          />
        </div>

        <div>
          <FieldLabel
            label="Company ID"
            hint="superadmin only · scoped admins issue for their own tenant"
          />
          <TextField
            mono
            value={form.companyId}
            onChange={(v) => setForm({ ...form, companyId: v })}
            placeholder="co_acme"
          />
        </div>

        <div>
          <FieldLabel label="Audience" hint="the vertical that accepts this key" />
          <TextField
            mono
            value={form.audience}
            onChange={(v) => setForm({ ...form, audience: v })}
            placeholder="brain"
          />
        </div>

        <div>
          <FieldLabel label="Scopes" hint="press Enter to add" />
          <ChipInput
            values={form.scopes}
            onChange={(v) => setForm({ ...form, scopes: v })}
            placeholder="brain:read"
          />
        </div>

        <div>
          <FieldLabel
            label="Expires in days"
            hint="optional · empty = does not expire (revocation still applies)"
          />
          <TextField
            mono
            value={form.expiresInDays}
            onChange={(v) => setForm({ ...form, expiresInDays: v })}
            placeholder="365"
          />
        </div>
      </div>
    </Sheet>
  )
}
