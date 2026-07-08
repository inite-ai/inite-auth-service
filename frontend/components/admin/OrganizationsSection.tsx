'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Building2,
  Plus,
  Trash2,
  Loader2,
  Search,
  Inbox,
  Users,
  Shield,
  Check,
  X,
  Copy,
  UserPlus,
  ShieldCheck,
  ShieldPlus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Sheet, Badge, ConfirmDialog, SkeletonRow } from '@/components/ui'

// ===== types (mirror src/organizations service responses) =====

interface Organization {
  id: string
  name: string
  slug: string
  companyId: string
  createdAt: string
  updatedAt?: string
}

interface Membership {
  id: string
  userId: string
  organizationId: string
  role: string
  status: string
  createdAt: string
}

interface OrgRoleView {
  slug: string
  name: string
  permissions: string[]
  system: boolean
}

interface OrganizationsSectionProps {
  accessToken: string
}

// System roles the backend always exposes (src/rbac/permissions.ts). Kept in
// sync as the fallback set for the membership role picker before roles load.
const SYSTEM_ROLES = ['owner', 'admin', 'member', 'viewer']

// Permission presets offered in the custom-role builder — the union of every
// permission the built-in roles use.
const PERMISSION_PRESETS = [
  'org:*',
  'org:read',
  'org:members:manage',
  'org:roles:manage',
]

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

// ===== shared form bits =====

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

function PermissionPicker({
  values,
  onChange,
}: {
  values: string[]
  onChange: (next: string[]) => void
}) {
  const [custom, setCustom] = useState('')
  const toggle = (p: string) =>
    onChange(values.includes(p) ? values.filter((x) => x !== p) : [...values, p])
  const addCustom = () => {
    const v = custom.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setCustom('')
  }
  const customValues = values.filter((v) => !PERMISSION_PRESETS.includes(v))

  return (
    <div className="space-y-1.5">
      {[...PERMISSION_PRESETS, ...customValues].map((p) => {
        const checked = values.includes(p)
        return (
          <button
            type="button"
            key={p}
            onClick={() => toggle(p)}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md border text-left transition-colors ${
              checked
                ? 'bg-[var(--accent-faint)] border-[color:var(--accent)]/40'
                : 'bg-[var(--bg-elevated)] border-[var(--border)] hover:border-[var(--border-strong)]'
            }`}
          >
            <span
              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                checked
                  ? 'bg-[var(--accent)] border-[var(--accent)]'
                  : 'border-[var(--border-strong)]'
              }`}
            >
              {checked && <Check className="w-3 h-3 text-white" />}
            </span>
            <span className="text-xs font-mono text-[var(--text)]">{p}</span>
          </button>
        )
      })}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustom()
            }
          }}
          placeholder="custom scope e.g. org:billing:manage"
          className="flex-1 h-8 px-2.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 font-mono"
        />
        <button
          type="button"
          onClick={addCustom}
          className="h-8 px-2.5 text-xs rounded-md bg-[var(--bg-overlay)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  )
}

function SectionHeader({
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

// ===== Create org panel =====

function CreateOrgPanel({
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
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setSlug('')
      setCompanyId('')
      setSlugTouched(false)
    }
  }, [open])

  // Auto-derive a slug from the name until the user edits the slug directly.
  const onNameChange = (v: string) => {
    setName(v)
    if (!slugTouched) {
      setSlug(
        v
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 63),
      )
    }
  }

  const submit = async () => {
    if (!name.trim() || !slug.trim()) {
      toast.error('Name and slug are required')
      return
    }
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
      toast.error('Slug must be lowercase alphanumeric/hyphen (2–63 chars)')
      return
    }
    setSaving(true)
    try {
      await api.post(
        '/admin/organizations',
        {
          name: name.trim(),
          slug: slug.trim(),
          ...(companyId.trim() ? { companyId: companyId.trim() } : {}),
        },
        config,
      )
      toast.success('Organization created')
      onCreated()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to create organization')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => !saving && onClose()}
      title="New organization"
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
            onClick={submit}
            disabled={saving}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Create organization
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <FieldLabel label="Name" />
          <TextField
            value={name}
            onChange={onNameChange}
            placeholder="Acme Inc."
          />
        </div>
        <div>
          <FieldLabel label="Slug" hint="lowercase, url-safe; also the tenant key" />
          <TextField
            mono
            value={slug}
            onChange={(v) => {
              setSlugTouched(true)
              setSlug(v)
            }}
            placeholder="acme"
          />
        </div>
        <div>
          <FieldLabel
            label="Company ID"
            hint="optional · bridges to M2M companyId; defaults to slug"
          />
          <TextField
            mono
            value={companyId}
            onChange={setCompanyId}
            placeholder="co_acme"
          />
        </div>
      </div>
    </Sheet>
  )
}

// ===== Org details panel (members + roles) =====

function OrgDetailsPanel({
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

// ===== Members =====

function MembersManager({
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

// ===== Roles =====

function RolesManager({
  orgId,
  config,
  roles,
  onChanged,
}: {
  orgId: string
  config: any
  roles: OrgRoleView[]
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [permissions, setPermissions] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setSlug('')
    setName('')
    setPermissions([])
  }

  const createRole = async () => {
    if (!slug.trim() || !name.trim()) {
      toast.error('Slug and name are required')
      return
    }
    if (SYSTEM_ROLES.includes(slug.trim())) {
      toast.error(`"${slug.trim()}" is a reserved system role`)
      return
    }
    if (permissions.length === 0) {
      toast.error('Add at least one permission')
      return
    }
    setBusy(true)
    try {
      await api.post(
        `/admin/organizations/${orgId}/roles`,
        { slug: slug.trim(), name: name.trim(), permissions },
        config,
      )
      toast.success('Role created')
      reset()
      setAdding(false)
      onChanged()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to create role')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <SectionHeader
        icon={Shield}
        title={`Roles (${roles.length})`}
        action={
          !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)] inline-flex items-center gap-1"
            >
              <ShieldPlus className="w-3.5 h-3.5" />
              Add custom role
            </button>
          )
        }
      />

      <div className="space-y-1 mb-3">
        {roles.map((r) => (
          <div
            key={r.slug}
            className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2"
          >
            <div className="flex items-center gap-2">
              {r.system ? (
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--text-faint)] shrink-0" />
              ) : (
                <Shield className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              )}
              <span className="text-xs font-mono text-[var(--text)]">
                {r.slug}
              </span>
              <Badge variant={r.system ? 'neutral' : 'accent'}>
                {r.system ? 'system' : 'custom'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5 pl-[22px]">
              {r.permissions.map((p) => (
                <Badge key={p} variant="mono" mono>
                  {p}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel label="Slug" />
              <TextField mono value={slug} onChange={setSlug} placeholder="billing-admin" />
            </div>
            <div>
              <FieldLabel label="Name" />
              <TextField value={name} onChange={setName} placeholder="Billing Admin" />
            </div>
          </div>
          <div>
            <FieldLabel label="Permissions" hint="pick from the catalog or add a custom scope" />
            <PermissionPicker values={permissions} onChange={setPermissions} />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                reset()
                setAdding(false)
              }}
              disabled={busy}
              className="h-8 px-3 text-xs rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createRole}
              disabled={busy}
              className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Create role
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
