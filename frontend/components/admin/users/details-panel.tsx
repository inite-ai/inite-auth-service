'use client'

import { Edit2, Trash2, Key, Wallet, Shield, LogOut } from 'lucide-react'
import { Sheet, Badge } from '@/components/ui'
import { UserDetails, formatRelative } from './types'
import { initialAvatar, Section, Stat } from './shared'

export function UserDetailsPanel({
  user,
  onClose,
  onEdit,
  onDelete,
  onRevokeSessions,
}: {
  user: UserDetails | null
  onClose: () => void
  onEdit: (u: UserDetails) => void
  onDelete: (u: UserDetails) => void
  onRevokeSessions: (u: UserDetails) => void
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
          <div className="flex items-center gap-1">
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
              onClick={() => onRevokeSessions(user)}
              title="Revoke every active session, lock the account for 24h, and fan out back-channel logout"
              className="h-8 px-3 inline-flex items-center gap-1.5 text-xs rounded-md text-[var(--text-muted)] hover:text-[color:var(--warning)] hover:bg-[color:var(--warning)]/10"
            >
              <LogOut className="w-3.5 h-3.5" />
              Revoke sessions
            </button>
          </div>
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
