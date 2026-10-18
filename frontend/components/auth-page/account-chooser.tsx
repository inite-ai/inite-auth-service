'use client'

import { motion } from 'framer-motion'
import { UserRound } from 'lucide-react'
import { authStorage } from '@/lib/authStorage'
import { useT } from '@/lib/i18n'
import { buildConsentUrl, OAuthParams } from '@/lib/oauthHelpers'
import { AuthVariant, switchAccountHref } from './shared'

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * "You are signed in as A" — shown instead of silently continuing when the
 * app asked for another account (login_hint), for an account choice
 * (prompt=select_account), or when the person opened "Create account" while
 * signed in. The account the app asked for, when it named one, is the first
 * button; continuing as the session is always there too, because a person
 * may well want to use the account they are in.
 */
export function AccountChooser({
  variant,
  oauthParams,
  signedInAs,
}: {
  variant: AuthVariant
  oauthParams: OAuthParams
  signedInAs: { email: string | null }
}) {
  const t = useT()
  const current = signedInAs.email
  const wanted =
    oauthParams.loginHint && !(current && sameAddress(current, oauthParams.loginHint))
      ? oauthParams.loginHint
      : null

  // "Continue" goes to /consent, not back through /authorize, and without
  // the hint: the person has answered, the question is not asked again.
  const continueHere = () => {
    window.location.href = buildConsentUrl({ ...oauthParams, loginHint: null })
  }
  const switchAccount = () => {
    authStorage.clear()
    window.location.href = switchAccountHref(variant, oauthParams)
  }

  const primary =
    'w-full inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors'
  const secondary =
    'w-full inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg-overlay)] transition-colors'

  const continueLabel = current
    ? t('auth.account.continueAs').replace('{email}', current)
    : t('auth.account.continue')
  const switchLabel = wanted
    ? t('auth.account.useWanted').replace('{email}', wanted)
    : t('auth.account.useAnother')

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <h1 className="text-[28px] leading-tight font-semibold text-[var(--text)] tracking-tight">
        {t('auth.account.title')}
      </h1>
      {oauthParams.clientId && (
        <p className="mt-3 text-xs text-[var(--text-faint)]">
          {t('auth.hero.forClient')}{' '}
          <span className="font-mono text-[var(--text-muted)]">{oauthParams.clientId}</span>
        </p>
      )}

      <div className="mt-8 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
        <span className="w-8 h-8 rounded-md bg-[var(--bg-overlay)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
          <UserRound className="w-4 h-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-[var(--text-muted)]">{t('auth.account.signedInAs')}</span>
          <span className="block truncate text-sm font-medium text-[var(--text)]">
            {current ?? t('auth.account.noEmail')}
          </span>
        </span>
      </div>

      {wanted && (
        <p role="status" className="mt-4 text-sm text-[var(--text-muted)]">
          {t('auth.account.wantedNotice').replace('{email}', wanted)}
        </p>
      )}

      <div className="mt-6 space-y-2">
        {wanted ? (
          <>
            <button type="button" className={primary} onClick={switchAccount}>
              {switchLabel}
            </button>
            <button type="button" className={secondary} onClick={continueHere}>
              {continueLabel}
            </button>
          </>
        ) : (
          <>
            <button type="button" className={primary} onClick={continueHere}>
              {continueLabel}
            </button>
            <button type="button" className={secondary} onClick={switchAccount}>
              {switchLabel}
            </button>
          </>
        )}
      </div>
    </motion.div>
  )
}
