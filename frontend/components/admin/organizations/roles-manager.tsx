'use client'

import { useState } from 'react'
import { Shield, Check, Loader2, ShieldCheck, ShieldPlus, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Badge } from '@/components/ui'
import { FieldLabel, TextField } from '@/components/admin/form-controls'
import { SYSTEM_ROLES, type OrgRoleView } from './types'
import { SectionHeader } from './details-panel'
import { PermissionPicker } from './permission-picker'

// ===== Roles =====

export function RolesManager({
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
  // Slug of the custom role currently being edited inline (null = none).
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPerms, setEditPerms] = useState<string[]>([])

  const reset = () => {
    setSlug('')
    setName('')
    setPermissions([])
  }

  const startEdit = (r: OrgRoleView) => {
    setAdding(false)
    setEditingSlug(r.slug)
    setEditName(r.name || r.slug)
    setEditPerms(r.permissions)
  }

  const saveEdit = async () => {
    if (!editingSlug) return
    if (!editName.trim()) {
      toast.error('Name is required')
      return
    }
    if (editPerms.length === 0) {
      toast.error('Add at least one permission')
      return
    }
    setBusy(true)
    try {
      await api.put(
        `/admin/organizations/${orgId}/roles/${editingSlug}`,
        { name: editName.trim(), permissions: editPerms },
        config,
      )
      toast.success('Role updated')
      setEditingSlug(null)
      onChanged()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to update role')
    } finally {
      setBusy(false)
    }
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
        {roles.map((r) =>
          editingSlug === r.slug ? (
            <div
              key={r.slug}
              className="bg-[var(--bg)] border border-[var(--accent)]/40 rounded-md p-3 space-y-3"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span className="text-xs font-mono text-[var(--text)]">{r.slug}</span>
                <Badge variant="accent">editing</Badge>
              </div>
              <div>
                <FieldLabel label="Name" />
                <TextField value={editName} onChange={setEditName} placeholder="Billing Admin" />
              </div>
              <div>
                <FieldLabel label="Permissions" hint="pick from the catalog or add a custom scope" />
                <PermissionPicker values={editPerms} onChange={setEditPerms} />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSlug(null)}
                  disabled={busy}
                  className="h-8 px-3 text-xs rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={busy}
                  className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div
              key={r.slug}
              className="group bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2"
            >
              <div className="flex items-center gap-2">
                {r.system ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--text-faint)] shrink-0" />
                ) : (
                  <Shield className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                )}
                <span className="text-xs font-mono text-[var(--text)]">{r.slug}</span>
                <Badge variant={r.system ? 'neutral' : 'accent'}>
                  {r.system ? 'system' : 'custom'}
                </Badge>
                {!r.system && (
                  <button
                    type="button"
                    onClick={() => startEdit(r)}
                    title="Edit permissions"
                    className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-[var(--accent)]"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5 pl-[22px]">
                {r.permissions.map((p) => (
                  <Badge key={p} variant="mono" mono>
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          ),
        )}
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
