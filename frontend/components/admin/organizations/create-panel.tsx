'use client'

import { useState, useEffect } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Sheet } from '@/components/ui'
import { FieldLabel, TextField } from '@/components/admin/form-controls'

// ===== Create org panel =====

export function CreateOrgPanel({
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
