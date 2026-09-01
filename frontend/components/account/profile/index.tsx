'use client'

import { useState } from 'react'
import { MapPin, Briefcase, Pencil, Check, X, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useT } from '@/lib/i18n'
import { Button, Card, CardHeader, Badge, Input, CopyButton } from '@/components/ui'
import { Note } from '../shared'
import { EmailChangeSheet } from './EmailChangeSheet'
import { Avatar } from './Avatar'
import type { AccountUser } from '../types'

interface ProfileSectionProps {
  user: AccountUser
  accessToken: string
  onUpdate: () => void
}

/** Editable fields, mirroring PUT /auth/identity/profile. */
type ProfileForm = Pick<AccountUser, 'name' | 'bio' | 'location' | 'profession' | 'avatarUrl'>

function toForm(user: AccountUser): ProfileForm {
  return {
    name: user.name ?? '',
    bio: user.bio ?? '',
    location: user.location ?? '',
    profession: user.profession ?? '',
    avatarUrl: user.avatarUrl ?? '',
  }
}

export default function ProfileSection({ user, accessToken, onUpdate }: ProfileSectionProps) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [emailSheetOpen, setEmailSheetOpen] = useState(false)
  const [form, setForm] = useState<ProfileForm>(() => toForm(user))

  const set = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const startEditing = () => {
    // Re-seed from the freshest user on every open, so an edit started
    // after a background refresh doesn't write back stale values.
    setForm(toForm(user))
    setEditing(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/auth/identity/profile', form, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      toast.success(t('account.profile.saved'))
      setEditing(false)
      onUpdate()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('account.profile.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleResendVerification = async () => {
    try {
      await api.post('/auth/identity/email/resend-verification', {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      toast.success(t('account.email.resent'))
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('error.network'))
    }
  }

  const handleCancelPendingChange = async () => {
    try {
      await api.post('/auth/identity/email/change/cancel', {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      toast.success(t('account.email.pending.cancelled'))
      onUpdate()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('error.network'))
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title={t('account.profile.title')}
          description={t('account.profile.subtitle')}
          action={
            editing ? (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  block={false}
                  onClick={() => setEditing(false)}
                  icon={<X className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  size="sm"
                  block={false}
                  loading={saving}
                  onClick={handleSave}
                  icon={<Check className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  {t('common.save')}
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                block={false}
                onClick={startEditing}
                icon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                {t('account.profile.edit')}
              </Button>
            )
          }
        />

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar name={user.name} email={user.email} url={editing ? form.avatarUrl : user.avatarUrl} />

          <div className="min-w-0 flex-1 space-y-4">
            {editing ? (
              <>
                <Input
                  name="name"
                  label={t('account.profile.field.name')}
                  placeholder={t('account.profile.field.name.placeholder')}
                  value={form.name ?? ''}
                  onChange={(e) => set('name', e.target.value)}
                />
                <Input
                  name="bio"
                  label={t('account.profile.field.bio')}
                  placeholder={t('account.profile.field.bio.placeholder')}
                  value={form.bio ?? ''}
                  onChange={(e) => set('bio', e.target.value)}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    name="location"
                    label={t('account.profile.field.location')}
                    placeholder={t('account.profile.field.location.placeholder')}
                    value={form.location ?? ''}
                    onChange={(e) => set('location', e.target.value)}
                  />
                  <Input
                    name="profession"
                    label={t('account.profile.field.profession')}
                    placeholder={t('account.profile.field.profession.placeholder')}
                    value={form.profession ?? ''}
                    onChange={(e) => set('profession', e.target.value)}
                  />
                </div>
                <Input
                  name="avatarUrl"
                  type="url"
                  inputMode="url"
                  label={t('account.profile.field.avatar')}
                  helper={t('account.profile.field.avatar.helper')}
                  placeholder="https://…"
                  value={form.avatarUrl ?? ''}
                  onChange={(e) => set('avatarUrl', e.target.value)}
                />
              </>
            ) : (
              <>
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-[var(--text)]">
                    {user.name || t('account.profile.anonymous')}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-[var(--text-muted)]">{user.email}</span>
                    {user.emailVerified ? (
                      <Badge
                        variant="success"
                        icon={<Check className="h-2.5 w-2.5" aria-hidden="true" />}
                      >
                        {t('account.email.verified')}
                      </Badge>
                    ) : (
                      <Badge
                        variant="warning"
                        icon={<AlertCircle className="h-2.5 w-2.5" aria-hidden="true" />}
                      >
                        {t('account.email.unverified')}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      block={false}
                      onClick={() => setEmailSheetOpen(true)}
                    >
                      {t('account.email.change')}
                    </Button>
                    {!user.emailVerified && (
                      <Button
                        variant="ghost"
                        size="sm"
                        block={false}
                        onClick={handleResendVerification}
                      >
                        {t('account.email.resend')}
                      </Button>
                    )}
                  </div>
                </div>

                {user.pendingEmailChange && (
                  <Note tone="warning" icon={<AlertCircle className="h-3.5 w-3.5" />}>
                    <p className="font-medium">{t('account.email.pending.title')}</p>
                    <p className="mt-0.5 text-[var(--text-muted)]">
                      {t('account.email.pending.body', {
                        email: user.pendingEmailChange.newEmail,
                      })}
                    </p>
                    <button
                      type="button"
                      onClick={handleCancelPendingChange}
                      className="mt-1.5 font-medium underline underline-offset-2 hover:no-underline"
                    >
                      {t('account.email.pending.cancel')}
                    </button>
                  </Note>
                )}

                {user.bio && (
                  <p className="text-sm leading-relaxed text-[var(--text-muted)]">{user.bio}</p>
                )}

                {(user.location || user.profession) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                    {user.location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" aria-hidden="true" />
                        {user.location}
                      </span>
                    )}
                    {user.profession && (
                      <span className="inline-flex items-center gap-1.5">
                        <Briefcase className="h-3 w-3" aria-hidden="true" />
                        {user.profession}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}

            {user.did && (
              <div className="border-t border-[var(--border)] pt-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
                  {t('account.profile.did')}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text-muted)]">
                    {user.did}
                  </code>
                  <CopyButton value={user.did} what="DID" />
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <EmailChangeSheet
        open={emailSheetOpen}
        onClose={() => setEmailSheetOpen(false)}
        currentEmail={user.email}
        accessToken={accessToken}
        onDone={onUpdate}
      />
    </>
  )
}
