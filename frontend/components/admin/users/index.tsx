'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { ConfirmDialog } from '@/components/ui'
import { UserRow, UserDetails, RoleFilter } from './types'
import { RoleChips } from './shared'
import { UsersTable } from './table'
import { UserDetailsPanel } from './details-panel'
import { UserEditPanel } from './edit-panel'

interface UsersSectionProps {
  accessToken: string
}

export default function UsersSection({ accessToken }: UsersSectionProps) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')

  const [details, setDetails] = useState<UserDetails | null>(null)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<UserDetails | null>(null)
  const [revoking, setRevoking] = useState(false)

  const config = useMemo(
    () => ({ headers: { Authorization: `Bearer ${accessToken}` } }),
    [accessToken],
  )

  const loadUsers = useCallback(
    async (page = 1) => {
      setLoading(true)
      try {
        const res = await api.get(`/admin/users?page=${page}&limit=20`, config)
        setUsers(res.data.users)
        setPagination(res.data.pagination)
      } catch {
        toast.error('Failed to load users')
      } finally {
        setLoading(false)
      }
    },
    [config],
  )

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  // Client-side filter on top of the loaded page. Could be promoted to
  // server-side if the dataset grows.
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'all') {
        const roles = u.metadata?.roles ?? []
        if (roleFilter === 'admin' && !roles.includes('admin')) return false
        if (roleFilter === 'user' && roles.includes('admin')) return false
      }
      if (!q) return true
      return [u.name, u.email, u.did]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    })
  }, [users, search, roleFilter])

  const counts = useMemo(() => {
    let admins = 0
    for (const u of users) {
      if (u.metadata?.roles?.includes('admin')) admins++
    }
    return { admins, users: users.length - admins }
  }, [users])

  const openDetails = async (userId: string) => {
    try {
      const res = await api.get(`/admin/users/${userId}`, config)
      setDetails(res.data as UserDetails)
    } catch {
      toast.error('Failed to load user details')
    }
  }

  const deleteUser = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/admin/users/${deleteTarget.id}`, config)
      toast.success('User deleted')
      setDeleteTarget(null)
      setDetails(null)
      loadUsers(pagination.page)
    } catch {
      toast.error('Failed to delete user')
    }
  }

  const revokeSessions = async () => {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      const res = await api.post(
        `/admin/users/${revokeTarget.id}/revoke-sessions`,
        {},
        config,
      )
      const { refreshTokensRevoked = 0, backchannelLogoutRecipients = 0 } =
        res.data ?? {}
      toast.success(
        `Revoked ${refreshTokensRevoked} session${refreshTokensRevoked === 1 ? '' : 's'}` +
          ` · locked out 24h` +
          (backchannelLogoutRecipients
            ? ` · notified ${backchannelLogoutRecipients} RP${backchannelLogoutRecipients === 1 ? '' : 's'}`
            : ''),
      )
      setRevokeTarget(null)
      setDetails(null)
      loadUsers(pagination.page)
    } catch {
      toast.error('Failed to revoke sessions')
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-faint)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, or DID…"
            className="w-full h-8 pl-8 pr-3 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40"
          />
        </div>
        <RoleChips
          value={roleFilter}
          onChange={setRoleFilter}
          counts={counts}
          total={users.length}
        />
      </div>

      <div className="text-xs text-[var(--text-muted)]">
        {loading
          ? 'Loading…'
          : `${filteredUsers.length} of ${pagination.total} users`}
      </div>

      <UsersTable
        users={filteredUsers}
        loading={loading}
        pagination={pagination}
        onOpen={openDetails}
        onEdit={setEditing}
        onDelete={setDeleteTarget}
        onPage={loadUsers}
      />

      {/* Details panel */}
      <UserDetailsPanel
        user={details}
        onClose={() => setDetails(null)}
        onEdit={(u) => {
          setDetails(null)
          setEditing(u)
        }}
        onDelete={(u) => {
          setDetails(null)
          setDeleteTarget(u)
        }}
        onRevokeSessions={(u) => setRevokeTarget(u)}
      />

      {/* Edit panel */}
      <UserEditPanel
        user={editing}
        onClose={() => setEditing(null)}
        config={config}
        onSaved={() => {
          setEditing(null)
          loadUsers(pagination.page)
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        intent="danger"
        title={`Delete ${deleteTarget?.name || deleteTarget?.email || 'user'}?`}
        description="This permanently deletes the user and all associated data (passkeys, wallets, sessions). This cannot be undone."
        confirmLabel="Delete user"
        onConfirm={deleteUser}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!revokeTarget}
        intent="danger"
        busy={revoking}
        title={`Revoke sessions for ${revokeTarget?.name || revokeTarget?.email || 'user'}?`}
        description="Revokes every active refresh token, locks the account for 24h so password login can't immediately reissue, and fans out back-channel logout to relying parties. Use for a compromised or lost-device incident. Active access tokens expire on their own (minutes)."
        confirmLabel="Revoke sessions"
        onConfirm={revokeSessions}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  )
}
