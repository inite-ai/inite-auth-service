'use client'

import {
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Check,
  Inbox,
  ShieldCheck,
} from 'lucide-react'
import { Badge, SkeletonRow } from '@/components/ui'
import { UserRow, formatRelative } from './types'
import { initialAvatar, IconButton } from './shared'

export function UsersTable({
  users,
  loading,
  pagination,
  onOpen,
  onEdit,
  onDelete,
  onPage,
}: {
  users: UserRow[]
  loading: boolean
  pagination: { page: number; limit: number; total: number; pages: number }
  onOpen: (userId: string) => void
  onEdit: (u: UserRow) => void
  onDelete: (u: UserRow) => void
  onPage: (page: number) => void
}) {
  return (
    <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg overflow-hidden">
      {loading ? (
        <div className="p-4 space-y-2">
          {[...Array(6)].map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : users.length === 0 ? (
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
              {users.map((u) => {
                const isAdmin = u.metadata?.roles?.includes('admin')
                return (
                  <tr
                    key={u.id}
                    onClick={() => onOpen(u.id)}
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
                        <IconButton title="Edit" onClick={() => onEdit(u)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </IconButton>
                        <IconButton
                          title="Delete"
                          variant="danger"
                          onClick={() => onDelete(u)}
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
              onClick={() => onPage(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
              className="p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
