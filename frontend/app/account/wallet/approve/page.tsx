'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@/lib/i18n';
import { AppHeader } from '@/components/AppHeader';
import { useAccountData } from '@/components/account/use-account-data';
import { SiteApproval } from '@/components/account/wallet-approve/SiteApproval';
import { AFTER_LOGIN_KEY } from '@/components/account/wallet-approve/use-site-approval';

/**
 * Where a site sends a person whose INITE wallet it may not charge yet
 * (billing's approveUrl): ?service=<code>&session=<id>&returnTo=<https url>.
 */
function Approve() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const service = params.get('service') ?? '';
  const session = params.get('session') ?? undefined;
  const returnTo = params.get('returnTo') ?? undefined;
  const { token, user } = useAccountData();

  // Signing in lands on /account; it sends the person back here.
  useEffect(() => {
    try {
      sessionStorage.setItem(AFTER_LOGIN_KEY, window.location.pathname + window.location.search);
    } catch {
      // storage off: the person comes back through the site's link
    }
  }, []);
  useEffect(() => {
    if (token) {
      try {
        sessionStorage.removeItem(AFTER_LOGIN_KEY);
      } catch {
        // nothing to clear
      }
    }
  }, [token]);

  const currentUser = user.status === 'ready' ? user.data : null;
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AppHeader user={currentUser} context={t('account.initeWallet.title')} />
      <main className="mx-auto max-w-xl px-4 py-8">
        {!service ? (
          <p className="text-sm text-[var(--text-muted)]">{t('walletApprove.noSite')}</p>
        ) : token ? (
          <SiteApproval
            accessToken={token}
            label={currentUser?.email ? `INITE wallet · ${currentUser.email}` : 'INITE wallet'}
            service={service}
            session={session}
            returnTo={returnTo}
          />
        ) : (
          <button className="text-sm text-[var(--accent)]" onClick={() => router.push('/login')}>
            {t('common.signIn')}
          </button>
        )}
      </main>
    </div>
  );
}

export default function WalletApprovePage() {
  return (
    <Suspense>
      <Approve />
    </Suspense>
  );
}
