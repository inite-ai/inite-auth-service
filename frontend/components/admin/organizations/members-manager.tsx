'use client'

import { useState } from 'react'
import { Loader2, Users, X, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Badge } from '@/components/ui'
import type { Membership } from './types'
import { SectionHeader } from './details-panel'

// ===== Members =====

export function MembersManager({
  orgId,
  config,
  members,
  roleSlugs,
  onChanged,
}: {
  orgId: string
  config: any
  members: Membership[]
  roleSlugs: string[]
  onChanged: () => void
}) {
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState(roleSlugs[0] ?? 'member')
  const [busy, setBusy] = useState(false)

  const addMember = async () => {
    if (!userId.trim()) {
      toast.error('User ID is required')
      return
    }
    setBusy(true)
    try {
      await api.post(
        `/admin/organizations/${orgId}/members`,
        { userId: userId.trim(), role },
        config,
      )
      toast.success('Member added')
      setUserId('')
      onChanged()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to add member')
    } finally {
      setBusy(false)
    }
  }

  const removeMember = async (uid: string) => {
    try {
      await api.delete(`/admin/organizations/${orgId}/members/${uid}`, config)
      toast.success('Member removed')
      onChanged()
    } catch {
      toast.error('Failed to remove member')
    }
  }

  // Inline role change → immediate upsert (POST members is an upsert).
  const changeRole = async (uid: string, newRole: string) => {
    try {
      await api.post(
        `/admin/organizations/${orgId}/members`,
        { userId: uid, role: newRole },
        config,
      )
      toast.success('Role updated')
      onChanged()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to update role')
    }
  }

  return (
    <div>
      <SectionHeader
        icon={Users}
        title={`Members (${members.length})`}
      />

      {members.length > 0 ? (
        <div className="space-y-1 mb-3">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5"
            >
              <span className="flex-1 min-w-0 text-xs font-mono text-[var(--text)] truncate">
                {m.userId}
              </span>
              {m.status !== 'active' && (
                <Badge variant="neutral">{m.status}</Badge>
              )}
              <select
                value={m.role}
                onChange={(e) => changeRole(m.userId, e.target.value)}
                aria-label={`Role for ${m.userId}`}
                className="h-7 px-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                {/* Ensure the current role is selectable even if not in the known list. */}
                {(roleSlugs.includes(m.role) ? roleSlugs : [m.role, ...roleSlugs]).map(
                  (r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ),
                )}
              </select>
              <button
                type="button"
                onClick={() => removeMember(m.userId)}
                aria-label="Remove member"
                title="Remove member"
                className="p-1 text-[var(--text-faint)] hover:text-[color:var(--danger)] rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-[var(--text-faint)] mb-3">
          No members yet.
        </p>
      )}

      {/* Add member */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="User ID (uuid)"
          className="flex-1 h-8 px-2.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 font-mono"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-8 px-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
        >
          {roleSlugs.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addMember}
          disabled={busy}
          className="h-8 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <UserPlus className="w-3.5 h-3.5" />
          )}
          Add
        </button>
      </div>
    </div>
  )
}
