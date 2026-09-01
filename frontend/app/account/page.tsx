'use client'

import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { authStorage } from '@/lib/authStorage'
import { useT } from '@/lib/i18n'
import { AppHeader } from '@/components/AppHeader'
import { Card, Skeleton } from '@/components/ui'
import {
  ProfileSection,
  SecuritySection,
  SecurityAuditSection,
  PasskeysSection,
  WalletsSection,
  SessionsSection,
  DangerZoneSection,
} from '@/components/account'
import { AccountNav } from '@/components/account/AccountNav'
import { SectionAnchor, SectionError } from '@/components/account/shared'
import { useAccountData, type Loadable } from '@/components/account/use-account-data'

export default function AccountPage() {
  const t = useT()
  const router = useRouter()
  const { token, user, security, passkeys, wallets, reload } = useAccountData()

  const handleLogout = async () => {
    try {
      await api.get('/oauth/logout', { withCredentials: true }).catch(() => {})
      if (token) {
        await api
          .delete('/auth/session', { headers: { Authorization: `Bearer ${token}` } })
          .catch(() => {})
      }
    } finally {
      authStorage.clear()
      router.push('/login')
      toast.success(t('common.signOut'))
    }
  }

  const currentUser = user.status === 'ready' ? user.data : null

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AppHeader user={currentUser} context={t('account.title')} />

      {/* Matches the header's max-w-6xl so the nav rail lines up with the
          brand mark instead of floating in unaligned whitespace. */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">
            {t('account.title')}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t('account.subtitle')}</p>
        </header>

        <div className="lg:grid lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-10">
          <AccountNav />

          <main className="max-w-3xl space-y-4">
            <SectionAnchor id="profile">
              <Resource
                state={user}
                onRetry={reload}
                skeletonRows={3}
                render={(data) => (
                  <ProfileSection
                    user={data}
                    accessToken={token ?? ''}
                    onUpdate={reload}
                  />
                )}
              />
            </SectionAnchor>

            <SectionAnchor id="security">
              <Resource
                state={security}
                onRetry={reload}
                skeletonRows={4}
                render={(data) => (
                  <SecuritySection
                    securityStatus={data}
                    accessToken={token ?? ''}
                    onUpdate={reload}
                  />
                )}
              />
            </SectionAnchor>

            <SectionAnchor id="passkeys">
              <Resource
                state={passkeys}
                onRetry={reload}
                skeletonRows={2}
                render={(data) => (
                  <PasskeysSection
                    passkeys={data}
                    hasPassword={security.status === 'ready' && security.data.hasPassword}
                    accessToken={token ?? ''}
                    onUpdate={reload}
                  />
                )}
              />
            </SectionAnchor>

            <SectionAnchor id="wallets">
              <Resource
                state={wallets}
                onRetry={reload}
                skeletonRows={2}
                render={(data) => (
                  <WalletsSection
                    wallets={data}
                    accessToken={token ?? ''}
                    onUpdate={reload}
                  />
                )}
              />
            </SectionAnchor>

            {/* Sessions and activity own their own fetch, loading and error
                states, so they mount as soon as there is a token. */}
            {token && (
              <>
                <SectionAnchor id="sessions">
                  <SessionsSection accessToken={token} />
                </SectionAnchor>

                <SectionAnchor id="activity">
                  <SecurityAuditSection accessToken={token} />
                </SectionAnchor>

                <SectionAnchor id="data">
                  <DangerZoneSection accessToken={token} onDeleteAccount={handleLogout} />
                </SectionAnchor>
              </>
            )}

            <footer className="mt-8 border-t border-[var(--border)] pt-5 text-center">
              <p className="text-xs text-[var(--text-faint)]">{t('account.footer')}</p>
            </footer>
          </main>
        </div>
      </div>
    </div>
  )
}

/**
 * Render one resource in whichever of its three states it is in.
 *
 * Keeps the failure of a single endpoint local to its own card — the rest of
 * the page stays usable, which is the whole point of loading them separately.
 */
function Resource<T>({
  state,
  onRetry,
  render,
  skeletonRows,
}: {
  state: Loadable<T>
  onRetry: () => void
  render: (data: T) => React.ReactNode
  skeletonRows: number
}) {
  const t = useT()

  if (state.status === 'loading') {
    return (
      <Card>
        <div className="space-y-3">
          <Skeleton width="w-32" height="h-4" />
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <Skeleton key={i} height="h-10" />
          ))}
        </div>
      </Card>
    )
  }

  if (state.status === 'error') {
    return (
      <Card>
        <SectionError
          title={t('account.error.title')}
          message={state.message}
          retryLabel={t('account.error.retry')}
          onRetry={onRetry}
        />
      </Card>
    )
  }

  return <>{render(state.data)}</>
}
