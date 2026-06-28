'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Check,
  Key,
  Wallet,
  Shield,
  Loader2,
  Inbox,
  ShieldCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import {
  Sheet,
  Badge,
  ConfirmDialog,
  SkeletonRow,
} from '@/components/ui'

interface UsersSectionProps {
  accessToken: string
}

interface UserRow {
  id: string
  name?: string | null
  email?: string | null
  emailVerified?: boolean
  did?: string
  bio?: string | null
  location?: string | null
  profession?: string | null
  twoFactorEnabled?: boolean
  createdAt: string
  metadata?: {
    roles?: string[]
    [key: string]: any
  }
}

interface UserDetails extends UserRow {
  passkeys?: any[]
  wallets?: any[]
  stats?: {
    totalPasskeys: number
    totalWallets: number
    activeSessions: number
  }
}

type RoleFilter = 'all' | 'admin' | 'user'

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
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

function initialAvatar(user: UserRow): string {
  return (
    user.name?.[0]?.toUpperCase() ??
    user.email?.[0]?.toUpperCase() ??
    '?'
  )
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

      {/* Table */}
      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(6)].map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="w-7 h-7 mx-auto text-[var(--text-faint)] mb-3" />
            <p className="text-sm font-medium text-[var(--text)]">
              No users match these filters
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Try a different search or clear the role filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Roles</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isAdmin = u.metadata?.roles?.includes('admin')
                  return (
                    <tr
                      key={u.id}
                      onClick={() => openDetails(u.id)}
                      className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-overlay)]/60 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2.5 min-w-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-7 h-7 rounded-md bg-[var(--accent-faint)] border border-[color:var(--accent)]/20 flex items-center justify-center text-[var(--accent)] text-[11px] font-semibold shrink-0">
                            {initialAvatar(u)}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-[var(--text)] truncate flex items-center gap-1.5">
                              {u.name || (
                                <span className="text-[var(--text-muted)]">
                                  Unnamed
                                </span>
                              )}
                              {isAdmin && (
                                <ShieldCheck className="w-3 h-3 text-[var(--accent)]" />
                              )}
                            </div>
                            {u.did && (
                              <div className="text-[11px] text-[var(--text-faint)] font-mono truncate">
                                {u.did.length > 28
                                  ? u.did.slice(0, 28) + '…'
                                  : u.did}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-[13px] text-[var(--text)] min-w-0">
                          <span className="truncate">{u.email || '—'}</span>
                          {u.emailVerified && (
                            <Check className="w-3 h-3 text-[color:var(--success)] shrink-0" />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {u.metadata?.roles?.length ? (
                            u.metadata.roles.map((role) => (
                              <Badge
                                key={role}
                                variant={role === 'admin' ? 'accent' : 'neutral'}
                              >
                                {role}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-[11px] text-[var(--text-faint)]">
                              —
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                        {formatRelative(u.createdAt)}
                      </td>
                      <td
                        className="px-3 py-2.5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-0.5">
                          <IconButton
                            title="Edit"
                            onClick={() => setEditing(u)}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </IconButton>
                          <IconButton
                            title="Delete"
                            variant="danger"
                            onClick={() => setDeleteTarget(u)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border)]">
            <span className="text-xs text-[var(--text-muted)]">
              Page {pagination.page} of {pagination.pages} ·{' '}
              {pagination.total.toLocaleString()} total
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => loadUsers(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => loadUsers(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

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
    </div>
  )
}

function RoleChips({
  value,
  onChange,
  counts,
  total,
}: {
  value: RoleFilter
  onChange: (v: RoleFilter) => void
  counts: { admins: number; users: number }
  total: number
}) {
  const opts: { value: RoleFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: total },
    { value: 'admin', label: 'Admins', count: counts.admins },
    { value: 'user', label: 'Users', count: counts.users },
  ]
  return (
    <div className="inline-flex p-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md">
      {opts.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`h-7 px-2.5 inline-flex items-center gap-1.5 text-xs rounded transition-colors ${
              active
                ? 'bg-[var(--bg-overlay)] text-[var(--text)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {o.label}
            <span
              className={`text-[10px] font-mono ${
                active ? 'text-[var(--text-muted)]' : 'text-[var(--text-faint)]'
              }`}
            >
              {o.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function IconButton({
  title,
  onClick,
  children,
  variant = 'default',
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  variant?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] transition-colors ${
        variant === 'danger'
          ? 'hover:text-[color:var(--danger)]'
          : 'hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">
        {title}
      </div>
      {children}
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-3 text-center">
      <div className="mb-1 inline-flex items-center justify-center w-6 h-6 rounded-md bg-[var(--bg-overlay)] text-[var(--text-muted)]">
        {icon}
      </div>
      <div className="text-base font-semibold text-[var(--text)]">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
        {label}
      </div>
    </div>
  )
}

// ===== Details panel =====

function UserDetailsPanel({
  user,
  onClose,
  onEdit,
  onDelete,
}: {
  user: UserDetails | null
  onClose: () => void
  onEdit: (u: UserDetails) => void
  onDelete: (u: UserDetails) => void
}) {
  if (!user) {
    return (
      <Sheet open={false} onClose={onClose} title="">
        <></>
      </Sheet>
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={user.name || user.email || 'User'}
      subtitle={user.email ?? undefined}
      width="md"
      footer={
        <div className="flex justify-between gap-2">
          <button
            type="button"
            onClick={() => onDelete(user)}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs rounded-md text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
          <button
            type="button"
            onClick={() => onEdit(user)}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Edit user
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-[var(--accent-faint)] border border-[color:var(--accent)]/20 flex items-center justify-center text-[var(--accent)] text-sm font-semibold">
            {initialAvatar(user)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--text)] truncate">
                {user.name || 'Unnamed'}
              </h3>
              {user.emailVerified && (
                <Badge variant="success">verified</Badge>
              )}
              {user.twoFactorEnabled && (
                <Badge variant="accent">2FA</Badge>
              )}
            </div>
            <div className="text-xs text-[var(--text-muted)] truncate">
              {user.email || 'no email'}
            </div>
          </div>
        </div>

        {user.stats && (
          <div className="grid grid-cols-3 gap-2">
            <Stat
              icon={<Key className="w-3.5 h-3.5" />}
              label="Passkeys"
              value={user.stats.totalPasskeys}
            />
            <Stat
              icon={<Wallet className="w-3.5 h-3.5" />}
              label="Wallets"
              value={user.stats.totalWallets}
            />
            <Stat
              icon={<Shield className="w-3.5 h-3.5" />}
              label="Sessions"
              value={user.stats.activeSessions}
            />
          </div>
        )}

        <Section title="Roles">
          <div className="flex flex-wrap gap-1">
            {user.metadata?.roles?.length ? (
              user.metadata.roles.map((role) => (
                <Badge
                  key={role}
                  variant={role === 'admin' ? 'accent' : 'neutral'}
                >
                  {role}
                </Badge>
              ))
            ) : (
              <span className="text-[11px] text-[var(--text-faint)]">
                No roles
              </span>
            )}
          </div>
        </Section>

        {user.bio && (
          <Section title="Bio">
            <p className="text-xs text-[var(--text)] leading-relaxed">
              {user.bio}
            </p>
          </Section>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Section title="Location">
            <p className="text-xs text-[var(--text)]">
              {user.location || '—'}
            </p>
          </Section>
          <Section title="Profession">
            <p className="text-xs text-[var(--text)]">
              {user.profession || '—'}
            </p>
          </Section>
        </div>

        {user.did && (
          <Section title="DID">
            <code className="block text-[11px] font-mono text-[var(--text)] bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 break-all">
              {user.did}
            </code>
          </Section>
        )}

        {user.passkeys && user.passkeys.length > 0 && (
          <Section title={`Passkeys (${user.passkeys.length})`}>
            <div className="space-y-1.5">
              {user.passkeys.map((pk: any) => (
                <div
                  key={pk.id}
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2"
                >
                  <div className="text-xs font-medium text-[var(--text)]">
                    {pk.deviceName || 'Unnamed device'}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Created {new Date(pk.createdAt).toLocaleDateString()}
                    {pk.lastUsedAt &&
                      ` · Last used ${new Date(pk.lastUsedAt).toLocaleDateString()}`}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {user.wallets && user.wallets.length > 0 && (
          <Section title={`Wallets (${user.wallets.length})`}>
            <div className="space-y-1.5">
              {user.wallets.map((w: any) => (
                <div
                  key={w.id}
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="mono" mono>
                      {w.chain}
                    </Badge>
                    <span className="text-[10px] text-[var(--text-faint)]">
                      {new Date(w.linkedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-[var(--text)] mt-1 truncate">
                    {w.address}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Created">
          <p className="text-xs text-[var(--text)]">
            {new Date(user.createdAt).toLocaleString()}
            <span className="ml-2 text-[var(--text-muted)]">
              ({formatRelative(user.createdAt)})
            </span>
          </p>
        </Section>
      </div>
    </Sheet>
  )
}

// ===== Edit panel =====

function UserEditPanel({
  user,
  onClose,
  config,
  onSaved,
}: {
  user: UserRow | null
  onClose: () => void
  config: any
  onSaved: () => void
}) {
  const [form, setForm] = useState<{
    name: string
    email: string
    emailVerified: boolean
    bio: string
    location: string
    profession: string
    roles: string
  } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) {
      setForm(null)
      return
    }
    setForm({
      name: user.name ?? '',
      email: user.email ?? '',
      emailVerified: !!user.emailVerified,
      bio: user.bio ?? '',
      location: user.location ?? '',
      profession: user.profession ?? '',
      roles: (user.metadata?.roles ?? []).join(', '),
    })
  }, [user])

  const save = async () => {
    if (!user || !form) return
    setSaving(true)
    try {
      const roles = form.roles
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)

      await api.put(
        `/admin/users/${user.id}`,
        {
          name: form.name,
          email: form.email,
          emailVerified: form.emailVerified,
          bio: form.bio,
          location: form.location,
          profession: form.profession,
        },
        config,
      )
      await api.put(`/admin/users/${user.id}/roles`, { roles }, config)
      toast.success('User updated')
      onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  if (!user || !form) {
    return (
      <Sheet open={false} onClose={onClose} title="">
        <></>
      </Sheet>
    )
  }

  const fieldClass =
    'w-full h-9 px-3 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40'

  return (
    <Sheet
      open
      onClose={() => !saving && onClose()}
      title={`Edit ${user.name || user.email || 'user'}`}
      subtitle={user.id}
      width="md"
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
            onClick={save}
            disabled={saving}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Save changes
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
            Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={fieldClass}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={fieldClass}
          />
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.emailVerified}
            onChange={(e) =>
              setForm({ ...form, emailVerified: e.target.checked })
            }
            className="w-4 h-4 rounded border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--accent)] focus:ring-[var(--accent-ring)] focus:ring-offset-0"
          />
          <span className="text-xs text-[var(--text)]">Email verified</span>
        </label>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
            Bio
          </label>
          <textarea
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
              Location
            </label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
              Profession
            </label>
            <input
              type="text"
              value={form.profession}
              onChange={(e) => setForm({ ...form, profession: e.target.value })}
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
            Roles
            <span className="ml-2 text-[var(--text-faint)] font-normal">
              comma-separated · add &ldquo;admin&rdquo; to grant admin access
            </span>
          </label>
          <input
            type="text"
            value={form.roles}
            onChange={(e) => setForm({ ...form, roles: e.target.value })}
            placeholder="admin, user, moderator"
            className={`${fieldClass} font-mono`}
          />
        </div>
      </div>
    </Sheet>
  )
}
