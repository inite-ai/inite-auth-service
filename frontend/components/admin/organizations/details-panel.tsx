'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Shield, Trash2, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Sheet, SkeletonRow } from '@/components/ui'
import type { Organization, Membership, OrgRoleView } from './types'
import { SYSTEM_ROLES } from './types'
import { MembersManager } from './members-manager'
import { RolesManager } from './roles-manager'

// ===== shared section header =====

export function SectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof Users
  title: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
        <Icon className="w-3.5 h-3.5" />
        {title}
      </div>
      {action}
    </div>
  )
}

// ===== Org details panel (members + roles) =====

export function OrgDetailsPanel({
  org,
  onClose,
  config,
  onDelete,
}: {
  org: Organization | null
  onClose: () => void
  config: any
  onDelete: (org: Organization) => void
}) {
  const [members, setMembers] = useState<Membership[]>([])
  const [roles, setRoles] = useState<OrgRoleView[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'members' | 'roles'>('members')

  const load = useCallback(async () => {
    if (!org) return
    setLoading(true)
    try {
      const [m, r] = await Promise.all([
        api.get(`/admin/organizations/${org.id}/members`, config),
        api.get(`/admin/organizations/${org.id}/roles`, config),
      ])
      setMembers(m.data as Membership[])
      setRoles(r.data as OrgRoleView[])
    } catch {
      toast.error('Failed to load organization details')
    } finally {
      setLoading(false)
    }
  }, [org, config])

  useEffect(() => {
    if (org) {
      setMembers([])
      setRoles([])
      load()
    }
  }, [org, load])

  if (!org) {
    return (
      <Sheet open={false} onClose={onClose} title="">
        <></>
      </Sheet>
    )
  }

  const roleSlugs = roles.length ? roles.map((r) => r.slug) : SYSTEM_ROLES

  return (
    <Sheet
      open
      onClose={onClose}
      title={org.name}
      subtitle={org.slug}
      width="lg"
      footer={
        <div className="flex justify-between items-center gap-2">
          <button
            type="button"
            onClick={() => onDelete(org)}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs rounded-md text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-xs rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)]"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Identity */}
        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
              Company ID
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(org.companyId)
                toast.success('Company ID copied')
              }}
              className="text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
              aria-label="Copy"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-1 text-sm font-mono text-[var(--text)] break-all">
            {org.companyId}
          </div>
        </div>

        {/* Segmented Members / Roles toggle */}
        <div className="inline-flex p-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md">
          {(['members', 'roles'] as const).map((key) => {
            const active = tab === key
            const Icon = key === 'members' ? Users : Shield
            const count = key === 'members' ? members.length : roles.length
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`h-7 px-3 inline-flex items-center gap-1.5 text-xs rounded capitalize transition-colors ${
                  active
                    ? 'bg-[var(--bg-overlay)] text-[var(--text)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {key}
                <span className="text-[10px] font-mono text-[var(--text-faint)]">
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : tab === 'members' ? (
          <MembersManager
            orgId={org.id}
            config={config}
            members={members}
            roleSlugs={roleSlugs}
            onChanged={load}
          />
        ) : (
          <RolesManager
            orgId={org.id}
            config={config}
            roles={roles}
            onChanged={load}
          />
        )}
      </div>
    </Sheet>
  )
}
