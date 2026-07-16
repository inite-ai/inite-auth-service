'use client'

import { useState, useEffect } from 'react'
import { Check, Loader2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Sheet } from '@/components/ui'
import { OAuthClient, SCOPE_PRESETS, AUDIENCE_PRESETS } from './types'
import { FieldLabel, TextField, GrantPicker, RedirectUris, ChipInput } from './shared'
import { CustomClaimsFields, buildCustomClaimsPayload } from './custom-claims-fields'
import {
  AuthMethodValue,
  AuthMethodField,
  buildAuthPayload,
  authValueFromClient,
} from './auth-method-field'

interface EditForm {
  name: string
  redirectUris: string[]
  allowedScopes: string[]
  allowedGrants: string[]
  allowedAudiences: string[]
  companyId: string
  backchannelLogoutUri: string
  claimPolicy: string[]
  claimPacks: string[]
  active: boolean
  auth: AuthMethodValue
}

export function EditClientPanel({
  client,
  onClose,
  config,
  onSaved,
  onDelete,
}: {
  client: OAuthClient | null
  onClose: () => void
  config: any
  onSaved: () => void
  onDelete: (client: OAuthClient) => void
}) {
  const [form, setForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!client) {
      setForm(null)
      return
    }
    setForm({
      name: client.name ?? '',
      redirectUris: [...(client.redirectUris ?? [])],
      allowedScopes: [...(client.allowedScopes ?? [])],
      allowedGrants: [...(client.allowedGrants ?? [])],
      allowedAudiences: [...(client.allowedAudiences ?? [])],
      companyId: client.companyId ?? '',
      backchannelLogoutUri: client.backchannelLogoutUri ?? '',
      claimPolicy: [...(client.customClaims?.policy ?? [])],
      claimPacks: [...(client.customClaims?.packs ?? [])],
      active: client.active !== false,
      auth: authValueFromClient(client),
    })
  }, [client])

  const save = async () => {
    if (!client || !form) return
    if (form.allowedGrants.length === 0) {
      toast.error('Pick at least one grant type')
      return
    }
    if (form.allowedScopes.length === 0) {
      toast.error('Pick at least one scope')
      return
    }
    const auth = buildAuthPayload(form.auth)
    if (!auth.ok) {
      toast.error(auth.error)
      return
    }
    setSaving(true)
    try {
      await api.put(
        `/admin/oauth-clients/${client.clientId}`,
        {
          name: form.name.trim(),
          redirectUris: form.redirectUris.filter(Boolean),
          allowedScopes: form.allowedScopes,
          allowedGrants: form.allowedGrants,
          companyId: form.companyId.trim() || null,
          allowedAudiences: form.allowedAudiences,
          backchannelLogoutUri: form.backchannelLogoutUri.trim() || null,
          customClaims: buildCustomClaimsPayload(form.claimPolicy, form.claimPacks),
          active: form.active,
          ...auth.payload,
        },
        config,
      )
      toast.success('Client updated')
      onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to update client')
    } finally {
      setSaving(false)
    }
  }

  if (!client || !form) {
    return (
      <Sheet
        open={false}
        onClose={onClose}
        title=""
        footer={null}
      >
        <></>
      </Sheet>
    )
  }

  const wantsRedirect =
    form.allowedGrants.includes('authorization_code') ||
    form.allowedGrants.includes('refresh_token')
  const wantsM2M = form.allowedGrants.includes('client_credentials')

  return (
    <Sheet
      open
      onClose={() => !saving && onClose()}
      title={`Edit ${client.name}`}
      subtitle={client.clientId}
      width="lg"
      footer={
        <div className="flex justify-between items-center gap-2">
          <button
            type="button"
            onClick={() => onDelete(client)}
            disabled={saving}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs rounded-md text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
          <div className="flex gap-2">
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
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <FieldLabel label="Name" />
          <TextField
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div className="flex items-center gap-3 p-3 rounded-md bg-[var(--bg)] border border-[var(--border)]">
          <button
            type="button"
            onClick={() => setForm({ ...form, active: !form.active })}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              form.active ? 'bg-[var(--accent)]' : 'bg-[var(--bg-overlay)]'
            }`}
            aria-label="Toggle active"
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                form.active ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
          <div className="min-w-0">
            <div className="text-xs font-medium text-[var(--text)]">
              {form.active ? 'Active' : 'Inactive'}
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              {form.active
                ? 'Issuing tokens. Existing tokens remain valid.'
                : 'Token requests rejected. Existing tokens remain valid until expiry.'}
            </div>
          </div>
        </div>

        <div>
          <FieldLabel label="Grant types" />
          <GrantPicker
            selected={form.allowedGrants}
            onToggle={(id) => {
              const set = new Set(form.allowedGrants)
              set.has(id) ? set.delete(id) : set.add(id)
              setForm({ ...form, allowedGrants: Array.from(set) })
            }}
          />
        </div>

        {wantsRedirect && (
          <div>
            <FieldLabel label="Redirect URIs" />
            <RedirectUris
              values={form.redirectUris}
              onChange={(v) => setForm({ ...form, redirectUris: v })}
            />
          </div>
        )}

        {wantsRedirect && (
          <div>
            <FieldLabel
              label="Back-channel logout URI"
              hint="optional · OIDC logout_token target"
            />
            <TextField
              mono
              value={form.backchannelLogoutUri}
              onChange={(e) =>
                setForm({ ...form, backchannelLogoutUri: e.target.value })
              }
              placeholder="https://app.example.com/oidc/logout"
            />
          </div>
        )}

        {wantsM2M && (
          <>
            <div>
              <FieldLabel
                label="Company ID"
                hint="optional · embedded as JWT sub"
              />
              <TextField
                mono
                value={form.companyId}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel label="Allowed audiences" />
              <ChipInput
                values={form.allowedAudiences}
                onChange={(v) => setForm({ ...form, allowedAudiences: v })}
                presets={AUDIENCE_PRESETS}
                placeholder="brain · inbox · …"
                variant="warning"
              />
            </div>
          </>
        )}

        <div>
          <FieldLabel label="Allowed scopes" />
          <ChipInput
            values={form.allowedScopes}
            onChange={(v) => setForm({ ...form, allowedScopes: v })}
            presets={SCOPE_PRESETS}
          />
        </div>

        <CustomClaimsFields
          policy={form.claimPolicy}
          packs={form.claimPacks}
          onChange={({ policy, packs }) =>
            setForm({ ...form, claimPolicy: policy, claimPacks: packs })
          }
        />

        <AuthMethodField
          value={form.auth}
          onChange={(auth) => setForm({ ...form, auth })}
        />
      </div>
    </Sheet>
  )
}
