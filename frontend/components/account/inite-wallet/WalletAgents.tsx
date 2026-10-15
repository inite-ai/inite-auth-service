'use client';

import { useState } from 'react';
import { Bot } from 'lucide-react';
import toast from 'react-hot-toast';
import { useT } from '@/lib/i18n';
import { Badge, Button, ConfirmDialog, Input, Sheet } from '@/components/ui';
import { Row, formatRelativeDays } from '../shared';
import { failure } from './qr';
import type { AgentLimits, WalletAgent } from './use-inite-wallet';

/**
 * The AI agents that asked to pay from the wallet. A new one waits until the
 * person sets its limits and approves it with the wallet passkey; an active
 * one shows what it spent; any can be revoked.
 */
export function WalletAgents({
  agents,
  approve,
  revoke,
}: {
  agents: WalletAgent[];
  approve: (id: string, limits: AgentLimits) => Promise<void>;
  revoke: (id: string) => Promise<void>;
}) {
  const t = useT();
  const [approving, setApproving] = useState<WalletAgent | null>(null);
  const [revoking, setRevoking] = useState<WalletAgent | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = agents.filter((a) => a.status !== 'revoked');
  if (shown.length === 0) return null;

  const confirmRevoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await revoke(revoking.id);
      toast.success(t('account.initeWallet.agents.revoked'));
      setRevoking(null);
    } catch (error) {
      toast.error(failure(error) ?? t('error.network'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 space-y-2 border-t border-[var(--border)] pt-4">
      <p className="text-xs text-[var(--text-faint)]">{t('account.initeWallet.agents.title')}</p>
      {shown.map((agent) => (
        <Row
          key={agent.id}
          icon={<Bot className="h-4 w-4" aria-hidden="true" />}
          title={
            <span className="flex flex-wrap items-center gap-1.5">
              {agent.name ?? agent.clientId}
              <Badge variant={agent.status === 'active' ? 'accent' : 'neutral'}>
                {t(`account.initeWallet.agents.status.${agent.status}` as never)}
              </Badge>
            </span>
          }
          description={
            agent.limits ? (
              <span className="tabular-nums">
                {t('account.initeWallet.agents.usage', {
                  today: agent.spent.today,
                  daily: agent.limits.daily,
                  month: agent.spent.month,
                  monthly: agent.limits.monthly,
                  each: agent.limits.perPayment,
                })}
                {agent.lastUsedAt ? ` · ${formatRelativeDays(agent.lastUsedAt)}` : ''}
              </span>
            ) : (
              t('account.initeWallet.agents.waiting')
            )
          }
          action={
            <span className="flex gap-2">
              {agent.status === 'pending' && (
                <Button size="sm" block={false} onClick={() => setApproving(agent)}>
                  {t('account.initeWallet.agents.approve')}
                </Button>
              )}
              <Button size="sm" block={false} variant="ghost" onClick={() => setRevoking(agent)}>
                {t('account.initeWallet.agents.revoke')}
              </Button>
            </span>
          }
        />
      ))}

      {approving && (
        <ApproveSheet agent={approving} onClose={() => setApproving(null)} approve={approve} />
      )}
      <ConfirmDialog
        open={!!revoking}
        intent="danger"
        title={t('account.initeWallet.agents.revoke')}
        description={t('account.initeWallet.agents.revoke.confirm')}
        confirmLabel={t('account.initeWallet.agents.revoke')}
        cancelLabel={t('common.cancel')}
        busy={busy}
        onConfirm={confirmRevoke}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}

function ApproveSheet({
  agent,
  onClose,
  approve,
}: {
  agent: WalletAgent;
  onClose: () => void;
  approve: (id: string, limits: AgentLimits) => Promise<void>;
}) {
  const t = useT();
  const [limits, setLimits] = useState<AgentLimits>({
    perPayment: agent.requested.perPayment,
    daily: agent.requested.daily,
    monthly: agent.requested.monthly,
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof AgentLimits) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setLimits({ ...limits, [key]: e.target.value.replace(',', '.') });

  const submit = async () => {
    setBusy(true);
    try {
      await approve(agent.id, { ...limits, merchants: agent.requested.merchants });
      toast.success(t('account.initeWallet.agents.approved'));
      onClose();
    } catch (error) {
      const reason = failure(error);
      if (reason === 'cancelled') toast(t('account.initeWallet.cancelled'));
      else toast.error(reason ?? t('error.network'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('account.initeWallet.agents.approveTitle', { name: agent.name ?? agent.clientId })}
      width="sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-muted)]">
          {t('account.initeWallet.agents.approveHint')}
        </p>
        <Input
          label={t('account.initeWallet.agents.perPayment')}
          inputMode="decimal"
          value={limits.perPayment}
          onChange={set('perPayment')}
        />
        <Input
          label={t('account.initeWallet.agents.daily')}
          inputMode="decimal"
          value={limits.daily}
          onChange={set('daily')}
        />
        <Input
          label={t('account.initeWallet.agents.monthly')}
          inputMode="decimal"
          value={limits.monthly}
          onChange={set('monthly')}
        />
        {agent.requested.merchants?.length ? (
          <p className="text-xs text-[var(--text-faint)]">
            {t('account.initeWallet.agents.merchants', {
              sites: agent.requested.merchants.join(', '),
            })}
          </p>
        ) : null}
        <p className="text-xs text-[var(--text-faint)]">{t('account.initeWallet.agents.twice')}</p>
        <Button loading={busy} onClick={submit}>
          {t('account.initeWallet.agents.confirm')}
        </Button>
      </div>
    </Sheet>
  );
}
