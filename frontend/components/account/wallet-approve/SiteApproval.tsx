'use client';

import { useState } from 'react';
import { CheckCircle2, KeyRound, ShieldCheck, Store, WalletCards } from 'lucide-react';
import toast from 'react-hot-toast';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, CardHeader, Input } from '@/components/ui';
import { failure } from '../inite-wallet/qr';
import { TopUpSheet } from '../inite-wallet/TopUpSheet';
import { useIniteWallet } from '../inite-wallet/use-inite-wallet';
import { useSiteApproval, type PayResult } from './use-site-approval';

function Step({
  n,
  done,
  title,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 border-t border-[var(--border)] py-4 first:border-t-0">
      <div className="mt-0.5 shrink-0">
        {done ? (
          <CheckCircle2 className="h-5 w-5 text-[color:var(--success)]" aria-hidden="true" />
        ) : (
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border-strong)] text-[11px] text-[var(--text-muted)]">
            {n}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <p
          className={`text-sm font-medium ${done ? 'text-[var(--text-muted)]' : 'text-[var(--text)]'}`}
        >
          {title}
        </p>
        {!done && children}
      </div>
    </div>
  );
}

/**
 * One page for a site that wants to charge the person's INITE wallet: make
 * the wallet if needed, allow INITE checkout (once per wallet), set the
 * site's limits, top up if short, and pay the purchase that brought them here.
 */
export function SiteApproval({
  accessToken,
  label,
  service,
  session,
  returnTo,
}: {
  accessToken: string;
  label: string;
  service: string;
  session?: string;
  returnTo?: string;
}) {
  const t = useT();
  const wallet = useIniteWallet(accessToken, label);
  const approval = useSiteApproval(accessToken, service, session);
  const [busy, setBusy] = useState<string | null>(null);
  const [limits, setLimits] = useState({ perPayment: '20', monthly: '100' });
  const [paid, setPaid] = useState<PayResult | null>(null);
  const [topUp, setTopUp] = useState(false);

  const run = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    try {
      await fn();
      await wallet.reload();
    } catch (error) {
      const reason = failure(error);
      if (reason === 'cancelled') toast(t('account.initeWallet.cancelled'));
      else toast.error(reason ?? t('error.network'));
    } finally {
      setBusy(null);
    }
  };

  const p = approval.preview;
  if (approval.error) {
    return (
      <Card>
        <p className="text-sm text-[var(--text-muted)]">{approval.error}</p>
      </Card>
    );
  }
  if (!p)
    return (
      <Card>
        <p className="text-sm text-[var(--text-muted)]">{t('common.loading')}</p>
      </Card>
    );

  const hasWallet = !!p.wallet;
  const checkoutOn = p.checkout === 'active';
  const allowed = !!p.allowed;
  const sessionOpen = p.session && p.session.status === 'created';
  const back = returnTo && /^https:\/\//.test(returnTo) ? returnTo : null;

  const payNow = () =>
    run('pay', async () => {
      const result = await approval.pay();
      if (result?.status === 'needs_approval') {
        if (result.reason === 'insufficient_funds') setTopUp(true);
        toast.error(t(`walletApprove.reason.${result.reason}` as never));
        return;
      }
      setPaid(result);
    });

  return (
    <Card>
      <CardHeader
        icon={<Store className="h-4 w-4" aria-hidden="true" />}
        title={t('walletApprove.title', { site: p.service.name })}
        description={t('walletApprove.subtitle', { site: p.service.name })}
      />

      {p.session && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm">
          <span className="text-[var(--text)]">{p.session.product}</span>
          <Badge variant="neutral">
            {p.session.amount} {p.session.currency}
          </Badge>
          {p.session.status !== 'created' && (
            <Badge variant="accent">{t('walletApprove.paid')}</Badge>
          )}
        </div>
      )}

      <Step n={1} done={hasWallet} title={t('walletApprove.step.wallet')}>
        <p className="text-sm text-[var(--text-muted)]">{t('account.initeWallet.empty.hint')}</p>
        <Button
          size="sm"
          block={false}
          loading={busy === 'wallet'}
          icon={<KeyRound className="h-3.5 w-3.5" />}
          onClick={() => run('wallet', wallet.open)}
        >
          {t('account.initeWallet.create')}
        </Button>
      </Step>

      <Step n={2} done={checkoutOn} title={t('walletApprove.step.checkout')}>
        <p className="text-sm text-[var(--text-muted)]">{t('walletApprove.checkoutHint')}</p>
        <Button
          size="sm"
          block={false}
          disabled={!hasWallet}
          loading={busy === 'checkout'}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          onClick={() => run('checkout', approval.allowCheckout)}
        >
          {t('walletApprove.checkoutButton')}
        </Button>
      </Step>

      <Step
        n={3}
        done={allowed}
        title={
          allowed
            ? t('walletApprove.allowed', {
                site: p.service.name,
                each: p.allowed!.perPayment,
                month: p.allowed!.monthly,
              })
            : t('walletApprove.step.limits', { site: p.service.name })
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={t('walletApprove.perPayment')}
            inputMode="decimal"
            value={limits.perPayment}
            onChange={(e) => setLimits({ ...limits, perPayment: e.target.value.replace(',', '.') })}
          />
          <Input
            label={t('walletApprove.monthly')}
            inputMode="decimal"
            value={limits.monthly}
            onChange={(e) => setLimits({ ...limits, monthly: e.target.value.replace(',', '.') })}
          />
        </div>
        <Button
          size="sm"
          block={false}
          disabled={!checkoutOn}
          loading={busy === 'limits'}
          onClick={() => run('limits', () => approval.allowSite(limits))}
        >
          {t('walletApprove.allowButton', { site: p.service.name })}
        </Button>
      </Step>

      {p.session && (
        <Step n={4} done={!sessionOpen || !!paid} title={t('walletApprove.step.pay')}>
          {p.wallet?.balance != null && (
            <p className="text-sm text-[var(--text-muted)]">
              {t('account.initeWallet.balance')}: {p.wallet.balance} USDC
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              block={false}
              disabled={!allowed}
              loading={busy === 'pay'}
              icon={<WalletCards className="h-3.5 w-3.5" />}
              onClick={payNow}
            >
              {t('walletApprove.payButton')}
            </Button>
            <Button
              size="sm"
              block={false}
              variant="secondary"
              disabled={!hasWallet}
              onClick={() => setTopUp(true)}
            >
              {t('account.initeWallet.topUp')}
            </Button>
          </div>
        </Step>
      )}

      {(paid || (allowed && (!p.session || !sessionOpen))) && (
        <div className="mt-2 space-y-3 rounded-md border border-[var(--border)] px-3 py-3 text-sm">
          <p className="text-[var(--text)]">
            {paid
              ? t('walletApprove.done.paid')
              : t('walletApprove.done.allowed', { site: p.service.name })}
          </p>
          {back && (
            <a href={back} className="inline-flex text-[var(--accent)] hover:underline">
              {t('walletApprove.back', { site: new URL(back).host })}
            </a>
          )}
        </div>
      )}

      {allowed && (
        <button
          className="mt-4 text-xs text-[var(--text-faint)] hover:text-[var(--text)]"
          onClick={() => run('revoke', approval.revokeSite)}
        >
          {t('walletApprove.revoke', { site: p.service.name })}
        </button>
      )}

      {p.wallet && wallet.state.status === 'ready' && (
        <TopUpSheet
          open={topUp}
          onClose={() => setTopUp(false)}
          address={p.wallet.address}
          pix={wallet.state.data.topups.pix}
          topUpByPix={wallet.topUpByPix}
          topUp={wallet.topUp}
          onPaid={approval.reload}
        />
      )}
    </Card>
  );
}
