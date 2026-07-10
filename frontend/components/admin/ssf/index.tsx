'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus,
  Trash2,
  Loader2,
  Inbox,
  Send,
  Download,
  ShieldCheck,
  Power,
  PowerOff,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Badge, ConfirmDialog, SkeletonRow } from '@/components/ui'
import { formatRelative } from '../form-controls'
import { SsfStream, EVENT_LABEL } from './events'
import CreateStreamPanel from './create-stream-panel'

interface SsfStreamsSectionProps {
  accessToken: string
}

export default function SsfStreamsSection({ accessToken }: SsfStreamsSectionProps) {
  const [streams, setStreams] = useState<SsfStream[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SsfStream | null>(null)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

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

  const toggleStatus = async (stream: SsfStream) => {
    const action = stream.status === 'enabled' ? 'disable' : 'enable'
    setToggling(stream.streamId)
    try {
      await api.post(`/ssf/streams/${stream.streamId}/${action}`, {}, config)
      toast.success(action === 'enable' ? 'Stream enabled' : 'Stream disabled')
      load()
    } catch {
      toast.error(`Failed to ${action} stream`)
    } finally {
      setToggling(null)
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
                          title={s.status === 'enabled' ? 'Disable stream' : 'Enable stream'}
                          aria-label={s.status === 'enabled' ? 'Disable stream' : 'Enable stream'}
                          onClick={() => toggleStatus(s)}
                          disabled={toggling === s.streamId}
                          className="p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] transition-colors disabled:opacity-50"
                        >
                          {toggling === s.streamId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : s.status === 'enabled' ? (
                            <PowerOff className="w-3.5 h-3.5" />
                          ) : (
                            <Power className="w-3.5 h-3.5" />
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
