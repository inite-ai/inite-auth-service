'use client'

import { useState } from 'react'
import { Shield, Check, Loader2, ShieldCheck, ShieldPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Badge } from '@/components/ui'
import { FieldLabel, TextField, CheckRow } from '@/components/admin/form-controls'
import { SYSTEM_ROLES, PERMISSION_PRESETS, type OrgRoleView } from './types'
import { SectionHeader } from './details-panel'

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
      {[...PERMISSION_PRESETS, ...customValues].map((p) => (
        <CheckRow
          key={p}
          checked={values.includes(p)}
          onToggle={() => toggle(p)}
          label={p}
          mono
        />
      ))}
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
