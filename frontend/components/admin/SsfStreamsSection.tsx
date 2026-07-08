'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Radio,
  Plus,
  Trash2,
  Loader2,
  Inbox,
  Send,
  Download,
  ShieldCheck,
  Check,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Sheet, Badge, ConfirmDialog, SkeletonRow } from '@/components/ui'

interface SsfStream {
  id: string
  streamId: string
  companyId?: string | null
  status: string
  deliveryMethod: 'push' | 'poll' | string
  pushEndpointUrl?: string | null
  pushAuthHeader?: string | null
  eventsRequested: string[]
  aud: string[]
  createdAt: string
}

interface SsfStreamsSectionProps {
  accessToken: string
}

// OpenID SSF / CAEP event types the transmitter emits. Kept in sync with
// src/ssf/caep-event-types.ts — friendly labels for the create form.
const CAEP_EVENTS: Array<{ id: string; label: string; hint: string }> = [
  {
    id: 'https://schemas.openid.net/secevent/caep/event-type/session-revoked',
    label: 'Session revoked',
    hint: 'A subject’s session was revoked — the receiver should end it too.',
  },
  {
    id: 'https://schemas.openid.net/secevent/caep/event-type/credential-change',
    label: 'Credential change',
    hint: 'Password, passkey, or MFA factor added/removed/changed.',
  },
  {
    id: 'https://schemas.openid.net/secevent/caep/event-type/token-claims-change',
    label: 'Token claims change',
    hint: 'Roles/scopes/claims changed — re-evaluate access.',
  },
  {
    id: 'https://schemas.openid.net/secevent/risc/event-type/account-disabled',
    label: 'Account disabled',
    hint: 'The account was disabled or suspended.',
  },
]

const EVENT_LABEL = new Map(CAEP_EVENTS.map((e) => [e.id, e.label]))

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime()
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function SsfStreamsSection({ accessToken }: SsfStreamsSectionProps) {
  const [streams, setStreams] = useState<SsfStream[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SsfStream | null>(null)
  const [verifying, setVerifying] = useState<string | null>(null)

  const config = useMemo(
    () => ({ headers: { Authorization: `Bearer ${accessToken}` } }),
    [accessToken],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/ssf/streams', config)
      setStreams(res.data as SsfStream[])
    } catch {
      toast.error('Failed to load SSF streams')
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => {
    load()
  }, [load])

  const verify = async (stream: SsfStream) => {
    setVerifying(stream.streamId)
    try {
      await api.post(`/ssf/streams/${stream.streamId}/verification`, {}, config)
      toast.success('Verification event sent')
    } catch {
      toast.error('Failed to send verification event')
    } finally {
      setVerifying(null)
    }
  }

  const remove = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/ssf/streams/${deleteTarget.streamId}`, config)
      toast.success('Stream deleted')
      setDeleteTarget(null)
      load()
    } catch {
      toast.error('Failed to delete stream')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-muted)]">
          {loading
            ? 'Loading…'
            : `${streams.length} Shared Signals stream${streams.length === 1 ? '' : 's'}`}
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New stream
        </button>
      </div>

      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(3)].map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : streams.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="w-7 h-7 mx-auto text-[var(--text-faint)] mb-3" />
            <p className="text-sm font-medium text-[var(--text)]">
              No Shared Signals streams yet
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Create a stream to push CAEP security events (session revoked,
              credential change…) to a relying party.
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-4 h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
            >
              <Plus className="w-3.5 h-3.5" />
              New stream
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
                  <th className="px-3 py-2 font-medium">Receiver</th>
                  <th className="px-3 py-2 font-medium">Delivery</th>
                  <th className="px-3 py-2 font-medium">Events</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {streams.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-overlay)]/60 transition-colors"
                  >
                    <td className="px-3 py-2.5 min-w-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-7 h-7 rounded-md bg-[var(--bg-overlay)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                          {s.deliveryMethod === 'push' ? (
                            <Send className="w-3.5 h-3.5" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-[var(--text)] truncate">
                            {s.pushEndpointUrl ?? 'Poll delivery'}
                          </div>
                          <div className="text-[11px] text-[var(--text-faint)] font-mono truncate">
                            {s.streamId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Badge variant={s.deliveryMethod === 'push' ? 'accent' : 'neutral'}>
                        {s.deliveryMethod}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-[var(--text-muted)]">
                      {s.eventsRequested.length} event
                      {s.eventsRequested.length === 1 ? '' : 's'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Badge variant={s.status === 'enabled' ? 'success' : 'neutral'}>
                        {s.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                      {formatRelative(s.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          title="Send verification event"
                          aria-label="Send verification event"
                          onClick={() => verify(s)}
                          disabled={verifying === s.streamId}
                          className="p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] transition-colors disabled:opacity-50"
                        >
                          {verifying === s.streamId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          title="Delete stream"
                          aria-label="Delete stream"
                          onClick={() => setDeleteTarget(s)}
                          className="p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[color:var(--danger)] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Event legend for the current streams */}
      {!loading && streams.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {[...new Set(streams.flatMap((s) => s.eventsRequested))].map((e) => (
            <Badge key={e} variant="mono" mono>
              {EVENT_LABEL.get(e) ?? e}
            </Badge>
          ))}
        </div>
      )}

      <CreateStreamPanel
        open={creating}
        onClose={() => setCreating(false)}
        config={config}
        onCreated={() => {
          setCreating(false)
          load()
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        intent="danger"
        title="Delete this stream?"
        description={
          <span>
            The receiver will stop getting security events. Queued undelivered
            events for{' '}
            <code className="font-mono text-[var(--text)]">
              {deleteTarget?.streamId}
            </code>{' '}
            are dropped. This cannot be undone.
          </span>
        }
        confirmLabel="Delete stream"
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

// ===== Create stream panel =====

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

function CreateStreamPanel({
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
        {/* Delivery method */}
        <div>
          <FieldLabel label="Delivery method" />
          <div className="inline-flex p-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md">
            {(['push', 'poll'] as const).map((m) => {
              const active = form.deliveryMethod === m
              const Icon = m === 'push' ? Send : Download
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm({ ...form, deliveryMethod: m })}
                  className={`h-7 px-3 inline-flex items-center gap-1.5 text-xs rounded capitalize transition-colors ${
                    active
                      ? 'bg-[var(--bg-overlay)] text-[var(--text)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {m}
                </button>
              )
            })}
          </div>
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

        {/* Event types */}
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
            {CAEP_EVENTS.map((e) => {
              const checked = form.events.includes(e.id)
              return (
                <button
                  type="button"
                  key={e.id}
                  onClick={() => toggleEvent(e.id)}
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
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[var(--text)]">
                      {e.label}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {e.hint}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Audience */}
        <div>
          <FieldLabel label="Audience" hint="optional · restricts which subjects’ events are delivered" />
          <ChipInput
            values={form.aud}
            onChange={(v) => setForm({ ...form, aud: v })}
            placeholder="https://rp.example.com and press Enter"
          />
        </div>

        {/* Tenant scope */}
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

// ===== small shared form bits (local to this section) =====

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
      {label}
      {hint && (
        <span className="ml-2 text-[var(--text-faint)] font-normal">{hint}</span>
      )}
    </label>
  )
}

function TextField({
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full h-9 px-3 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 ${
        mono ? 'font-mono' : ''
      }`}
    />
  )
}

function ChipInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
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
            <Badge key={v} variant="accent" mono>
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
    </div>
  )
}
