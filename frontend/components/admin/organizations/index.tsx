'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Building2, Plus, Trash2, Search, Inbox } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { ConfirmDialog, SkeletonRow } from '@/components/ui'
import { formatRelative } from '@/components/admin/form-controls'
import type { Organization } from './types'
import { CreateOrgPanel } from './create-panel'
import { OrgDetailsPanel } from './details-panel'

interface OrganizationsSectionProps {
  accessToken: string
}

export default function OrganizationsSection({
  accessToken,
}: OrganizationsSectionProps) {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [creating, setCreating] = useState(false)
  const [detailsOrg, setDetailsOrg] = useState<Organization | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Organization | null>(null)

  const config = useMemo(
    () => ({ headers: { Authorization: `Bearer ${accessToken}` } }),
    [accessToken],
  )

  const loadOrgs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/organizations', config)
      setOrgs(res.data as Organization[])
    } catch {
      toast.error('Failed to load organizations')
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => {
    loadOrgs()
  }, [loadOrgs])

  const visibleOrgs = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return orgs
    return orgs.filter((o) =>
      [o.name, o.slug, o.companyId].join(' ').toLowerCase().includes(q),
    )
  }, [orgs, search])

  const deleteOrg = async () => {
    if (!deleteConfirm) return
    try {
      await api.delete(`/admin/organizations/${deleteConfirm.id}`, config)
      toast.success('Organization deleted')
      setDeleteConfirm(null)
      setDetailsOrg(null)
      loadOrgs()
    } catch {
      toast.error('Failed to delete organization')
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-faint)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, slug, tenant…"
            className="h-8 pl-8 pr-3 w-64 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40"
          />
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New organization
        </button>
      </div>

      <div className="text-xs text-[var(--text-muted)]">
        {loading ? 'Loading…' : `${visibleOrgs.length} of ${orgs.length} organizations`}
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(4)].map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : visibleOrgs.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="w-7 h-7 mx-auto text-[var(--text-faint)] mb-3" />
            <p className="text-sm font-medium text-[var(--text)]">
              {orgs.length === 0
                ? 'No organizations yet'
                : 'No organizations match your search'}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {orgs.length === 0
                ? 'Create the first tenant to start assigning members and roles.'
                : 'Try a different search.'}
            </p>
            {orgs.length === 0 && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-4 h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
              >
                <Plus className="w-3.5 h-3.5" />
                New organization
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
                  <th className="px-3 py-2 font-medium">Organization</th>
                  <th className="px-3 py-2 font-medium">Company ID</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrgs.map((org) => (
                  <tr
                    key={org.id}
                    onClick={() => setDetailsOrg(org)}
                    className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-overlay)]/60 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 min-w-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-7 h-7 rounded-md bg-[var(--bg-overlay)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                          <Building2 className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-[var(--text)] truncate">
                            {org.name}
                          </div>
                          <div className="text-[11px] text-[var(--text-faint)] font-mono truncate">
                            {org.slug}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[11px] font-mono text-[var(--text-muted)] truncate max-w-[180px] inline-block">
                        {org.companyId}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                      {formatRelative(org.createdAt)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        title="Delete"
                        aria-label="Delete organization"
                        onClick={() => setDeleteConfirm(org)}
                        className="p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] hover:text-[color:var(--danger)] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create */}
      <CreateOrgPanel
        open={creating}
        onClose={() => setCreating(false)}
        config={config}
        onCreated={() => {
          setCreating(false)
          loadOrgs()
        }}
      />

      {/* Details — members + roles */}
      <OrgDetailsPanel
        org={detailsOrg}
        onClose={() => setDetailsOrg(null)}
        config={config}
        onDelete={(org) => setDeleteConfirm(org)}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteConfirm}
        intent="danger"
        title={`Delete ${deleteConfirm?.name ?? 'organization'}?`}
        description={
          <span>
            This permanently deletes the organization{' '}
            <code className="font-mono text-[var(--text)]">
              {deleteConfirm?.slug}
            </code>{' '}
            along with all its memberships and custom roles. This action cannot
            be undone.
          </span>
        }
        confirmLabel="Delete organization"
        onConfirm={deleteOrg}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  )
}
