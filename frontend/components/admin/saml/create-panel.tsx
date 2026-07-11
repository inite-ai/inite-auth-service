'use client'

import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import type { AxiosRequestConfig } from 'axios'
import api from '@/lib/api'
import { Sheet } from '@/components/ui'
import { FieldLabel, TextField } from '../form-controls'
import { CreateSamlConnectionInput } from './types'

const EMPTY: CreateSamlConnectionInput = {
  companyId: '',
  slug: '',
  displayName: '',
  idpEntityId: '',
  idpSsoUrl: '',
  idpCert: '',
}

function slugify(name: string): string {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-')
}

export default function CreateSamlPanel({
  open,
  onClose,
  onCreated,
  config,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
  config: AxiosRequestConfig
}) {
  const [form, setForm] = useState<CreateSamlConnectionInput>(EMPTY)
  const [slugTouched, setSlugTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(EMPTY)
      setSlugTouched(false)
    }
  }, [open])

  const set = (patch: Partial<CreateSamlConnectionInput>) =>
    setForm((f) => ({ ...f, ...patch }))

  const create = async () => {
    const slug = form.slug || slugify(form.displayName)
    if (!form.displayName.trim()) return toast.error('Display name is required')
    if (!slug) return toast.error('Slug is required')
    if (!form.companyId.trim()) return toast.error('Tenant (companyId) is required')
    if (!form.idpEntityId.trim()) return toast.error('IdP EntityID is required')
    if (!/^https?:\/\//.test(form.idpSsoUrl)) return toast.error('IdP SSO URL must be an http(s) URL')
    if (!form.idpCert.includes('BEGIN CERTIFICATE')) return toast.error('Paste the IdP signing certificate (PEM)')

    setSaving(true)
    try {
      await api.post('/admin/saml/connections', { ...form, slug }, config)
      toast.success('SAML connection created')
      onCreated()
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      toast.error(msg ?? 'Failed to create connection')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => !saving && onClose()}
      title="New SAML connection"
      subtitle="Inbound enterprise SSO (Service Provider)"
      width="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-8 px-3 text-xs rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={create}
            disabled={saving}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            Create connection
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel label="Display name" />
          <TextField
            value={form.displayName}
            onChange={(v) => set({ displayName: v, ...(slugTouched ? {} : { slug: slugify(v) }) })}
            placeholder="Acme Corp Okta"
          />
        </div>
        <div>
          <FieldLabel label="Slug" hint="used in /v1/auth/saml/<slug>/…" />
          <TextField
            value={form.slug}
            onChange={(v) => { setSlugTouched(true); set({ slug: slugify(v) }) }}
            placeholder="acme"
            mono
          />
        </div>
        <div>
          <FieldLabel label="Tenant (companyId)" hint="provisioned users are scoped here" />
          <TextField value={form.companyId} onChange={(v) => set({ companyId: v })} placeholder="acme" mono />
        </div>
        <div>
          <FieldLabel label="IdP EntityID" hint="expected Issuer on assertions" />
          <TextField
            value={form.idpEntityId}
            onChange={(v) => set({ idpEntityId: v })}
            placeholder="https://idp.acme.com/entity"
            mono
          />
        </div>
        <div>
          <FieldLabel label="IdP SSO URL" hint="redirect binding" />
          <TextField
            value={form.idpSsoUrl}
            onChange={(v) => set({ idpSsoUrl: v })}
            placeholder="https://idp.acme.com/sso"
            mono
          />
        </div>
        <div>
          <FieldLabel label="IdP signing certificate (PEM)" hint="encrypted at rest" />
          <textarea
            value={form.idpCert}
            onChange={(e) => set({ idpCert: e.target.value })}
            rows={6}
            placeholder={'-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----'}
            className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-xs font-mono text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 resize-y"
          />
        </div>
      </div>
    </Sheet>
  )
}
