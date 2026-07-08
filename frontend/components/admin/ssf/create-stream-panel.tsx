'use client'

import { useState, useEffect } from 'react'
import { Plus, Loader2, Send, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Sheet } from '@/components/ui'
import { FieldLabel, TextField, ChipInput, Segmented, CheckRow } from '../form-controls'
import { CAEP_EVENTS } from './events'

interface CreateForm {
  deliveryMethod: 'push' | 'poll'
  pushEndpointUrl: string
  pushAuthHeader: string
  events: string[]
  aud: string[]
  companyId: string
}

function initialForm(): CreateForm {
  return {
    deliveryMethod: 'push',
    pushEndpointUrl: '',
    pushAuthHeader: '',
    events: CAEP_EVENTS.map((e) => e.id),
    aud: [],
    companyId: '',
  }
}

export default function CreateStreamPanel({
  open,
  onClose,
  config,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  config: any
  onCreated: () => void
}) {
  const [form, setForm] = useState<CreateForm>(initialForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm(initialForm())
  }, [open])

  const allSelected = form.events.length === CAEP_EVENTS.length
  const toggleEvent = (id: string) =>
    setForm((f) => ({
      ...f,
      events: f.events.includes(id)
        ? f.events.filter((x) => x !== id)
        : [...f.events, id],
    }))

  const submit = async () => {
    if (form.deliveryMethod === 'push' && !form.pushEndpointUrl.trim()) {
      toast.error('Push delivery needs an endpoint URL')
      return
    }
    if (form.events.length === 0) {
      toast.error('Select at least one event type')
      return
    }
    setSaving(true)
    try {
      await api.post(
        '/ssf/streams',
        {
          delivery_method: form.deliveryMethod,
          ...(form.deliveryMethod === 'push'
            ? {
                push_endpoint_url: form.pushEndpointUrl.trim(),
                ...(form.pushAuthHeader.trim()
                  ? { push_auth_header: form.pushAuthHeader.trim() }
                  : {}),
              }
            : {}),
          events_requested: form.events,
          aud: form.aud,
          ...(form.companyId.trim() ? { companyId: form.companyId.trim() } : {}),
        },
        config,
      )
      toast.success('Stream created')
      onCreated()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to create stream')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => !saving && onClose()}
      title="New Shared Signals stream"
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
            Create stream
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <FieldLabel label="Delivery method" />
          <Segmented
            value={form.deliveryMethod}
            onChange={(m) => setForm({ ...form, deliveryMethod: m })}
            options={[
              { value: 'push', label: 'push', icon: Send },
              { value: 'poll', label: 'poll', icon: Download },
            ]}
          />
        </div>

        {form.deliveryMethod === 'push' ? (
          <>
            <div>
              <FieldLabel label="Push endpoint URL" hint="https · receiver’s SET ingress" />
              <TextField
                mono
                value={form.pushEndpointUrl}
                onChange={(v) => setForm({ ...form, pushEndpointUrl: v })}
                placeholder="https://rp.example.com/ssf/events"
              />
            </div>
            <div>
              <FieldLabel
                label="Push auth header"
                hint="optional · sent verbatim as Authorization"
              />
              <TextField
                mono
                value={form.pushAuthHeader}
                onChange={(v) => setForm({ ...form, pushAuthHeader: v })}
                placeholder="Bearer …"
              />
            </div>
          </>
        ) : (
          <div className="text-[11px] text-[var(--text-muted)] bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2">
            The receiver pulls events by POSTing to{' '}
            <code className="font-mono text-[var(--text)]">
              /v1/ssf/streams/&#123;id&#125;/poll
            </code>{' '}
            with the stream’s credentials.
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <FieldLabel label="Event types" />
            <button
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  events: allSelected ? [] : CAEP_EVENTS.map((e) => e.id),
                })
              }
              className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)]"
            >
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="space-y-1.5">
            {CAEP_EVENTS.map((e) => (
              <CheckRow
                key={e.id}
                checked={form.events.includes(e.id)}
                onToggle={() => toggleEvent(e.id)}
                label={e.label}
                hint={e.hint}
              />
            ))}
          </div>
        </div>

        <div>
          <FieldLabel label="Audience" hint="optional · restricts which subjects’ events are delivered" />
          <ChipInput
            values={form.aud}
            onChange={(v) => setForm({ ...form, aud: v })}
            placeholder="https://rp.example.com and press Enter"
          />
        </div>

        <div>
          <FieldLabel
            label="Company ID"
            hint="superadmin only · scope to a single tenant"
          />
          <TextField
            mono
            value={form.companyId}
            onChange={(v) => setForm({ ...form, companyId: v })}
            placeholder="co_acme"
          />
        </div>
      </div>
    </Sheet>
  )
}
