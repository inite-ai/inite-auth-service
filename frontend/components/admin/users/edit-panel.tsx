'use client'

import { useState, useEffect } from 'react'
import { Check, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { Sheet } from '@/components/ui'
import { UserRow } from './types'

export function UserEditPanel({
  user,
  onClose,
  config,
  onSaved,
}: {
  user: UserRow | null
  onClose: () => void
  config: any
  onSaved: () => void
}) {
  const [form, setForm] = useState<{
    name: string
    email: string
    emailVerified: boolean
    bio: string
    location: string
    profession: string
    roles: string
  } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) {
      setForm(null)
      return
    }
    setForm({
      name: user.name ?? '',
      email: user.email ?? '',
      emailVerified: !!user.emailVerified,
      bio: user.bio ?? '',
      location: user.location ?? '',
      profession: user.profession ?? '',
      roles: (user.metadata?.roles ?? []).join(', '),
    })
  }, [user])

  const save = async () => {
    if (!user || !form) return
    setSaving(true)
    try {
      const roles = form.roles
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)

      await api.put(
        `/admin/users/${user.id}`,
        {
          name: form.name,
          email: form.email,
          emailVerified: form.emailVerified,
          bio: form.bio,
          location: form.location,
          profession: form.profession,
        },
        config,
      )
      await api.put(`/admin/users/${user.id}/roles`, { roles }, config)
      toast.success('User updated')
      onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  if (!user || !form) {
    return (
      <Sheet open={false} onClose={onClose} title="">
        <></>
      </Sheet>
    )
  }

  const fieldClass =
    'w-full h-9 px-3 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40'

  return (
    <Sheet
      open
      onClose={() => !saving && onClose()}
      title={`Edit ${user.name || user.email || 'user'}`}
      subtitle={user.id}
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
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
            Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={fieldClass}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={fieldClass}
          />
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.emailVerified}
            onChange={(e) =>
              setForm({ ...form, emailVerified: e.target.checked })
            }
            className="w-4 h-4 rounded border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--accent)] focus:ring-[var(--accent-ring)] focus:ring-offset-0"
          />
          <span className="text-xs text-[var(--text)]">Email verified</span>
        </label>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
            Bio
          </label>
          <textarea
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
              Location
            </label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
              Profession
            </label>
            <input
              type="text"
              value={form.profession}
              onChange={(e) => setForm({ ...form, profession: e.target.value })}
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
            Roles
            <span className="ml-2 text-[var(--text-faint)] font-normal">
              comma-separated · add &ldquo;admin&rdquo; to grant admin access
            </span>
          </label>
          <input
            type="text"
            value={form.roles}
            onChange={(e) => setForm({ ...form, roles: e.target.value })}
            placeholder="admin, user, moderator"
            className={`${fieldClass} font-mono`}
          />
        </div>
      </div>
    </Sheet>
  )
}
