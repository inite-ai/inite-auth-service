'use client'

import { useState, useEffect } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Sheet } from '@/components/ui'
import { SCOPE_PRESETS, AUDIENCE_PRESETS } from './types'
import { FieldLabel, TextField, GrantPicker, RedirectUris, ChipInput } from './shared'
import {
  AuthMethodValue,
  AuthMethodField,
  buildAuthPayload,
  defaultAuthValue,
} from './auth-method-field'

interface CreateForm {
  name: string
  clientId: string
  redirectUris: string[]
  allowedScopes: string[]
  allowedGrants: string[]
  allowedAudiences: string[]
  companyId: string
  backchannelLogoutUri: string
  auth: AuthMethodValue
}

export function CreateClientPanel({
  open,
  onClose,
  config,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  config: any
  onCreated: (secret: string) => void
}) {
  const [form, setForm] = useState<CreateForm>(initialCreateForm())
  const [saving, setSaving] = useState(false)

  // Reset when re-opened.
  useEffect(() => {
    if (open) setForm(initialCreateForm())
  }, [open])

  const wantsRedirect =
    form.allowedGrants.includes('authorization_code') ||
    form.allowedGrants.includes('refresh_token')
  const wantsM2M = form.allowedGrants.includes('client_credentials')

  const submit = async () => {
    if (!form.name.trim() || !form.clientId.trim()) {
      toast.error('Name and Client ID are required')
      return
    }
    if (form.allowedGrants.length === 0) {
      toast.error('Pick at least one grant type')
      return
    }
    if (form.allowedScopes.length === 0) {
      toast.error('Pick at least one scope')
      return
    }
    if (wantsRedirect && form.redirectUris.filter(Boolean).length === 0) {
      toast.error('Authorization code grant requires at least one redirect URI')
      return
    }
    if (wantsM2M && form.allowedAudiences.length === 0) {
      toast(
        'No explicit audiences — tokens will default to clientId as aud.',
        { icon: '⚠️' },
      )
    }
    const auth = buildAuthPayload(form.auth)
    if (!auth.ok) {
      toast.error(auth.error)
      return
    }
    setSaving(true)
    try {
      const res = await api.post(
        '/admin/oauth-clients',
        {
          name: form.name.trim(),
          clientId: form.clientId.trim(),
          redirectUris: form.redirectUris.filter(Boolean),
          allowedScopes: form.allowedScopes,
          allowedGrants: form.allowedGrants,
          companyId: form.companyId.trim() || null,
          allowedAudiences: form.allowedAudiences,
          backchannelLogoutUri: form.backchannelLogoutUri.trim() || null,
          ...auth.payload,
        },
        config,
      )
      toast.success('OAuth client created')
      onCreated(res.data.clientSecret)
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to create client')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => !saving && onClose()}
      title="New OAuth client"
      width="lg"
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
            Create client
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel label="Application name" />
            <TextField
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My App"
            />
          </div>
          <div>
            <FieldLabel label="Client ID" />
            <TextField
              mono
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              placeholder="my-app"
            />
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
            <FieldLabel label="Redirect URIs" hint="must exact-match at /oauth/authorize" />
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
                placeholder="co_acme"
              />
            </div>
            <div>
              <FieldLabel
                label="Allowed audiences"
                hint="which services this M2M client can call"
              />
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
            placeholder="custom:scope and press Enter"
          />
        </div>

        <AuthMethodField
          value={form.auth}
          onChange={(auth) => setForm({ ...form, auth })}
        />
      </div>
    </Sheet>
  )
}

function initialCreateForm(): CreateForm {
  return {
    name: '',
    clientId: '',
    redirectUris: [''],
    allowedScopes: ['openid', 'profile', 'email'],
    allowedGrants: ['authorization_code', 'refresh_token'],
    allowedAudiences: [],
    companyId: '',
    backchannelLogoutUri: '',
    auth: defaultAuthValue(),
  }
}
