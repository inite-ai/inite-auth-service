'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { billing } from '@/lib/billing';
import { createWalletPasskey, stampWithWalletPasskey } from '@/lib/wallet-passkey';

export interface WalletActivity {
  kind: 'topup' | 'withdrawal';
  id: string;
  amount: string;
  currency: string;
  status: string;
  rail?: string;
  to?: string;
  txHash?: string | null;
  createdAt: string;
}

export interface WalletOverview {
  wallet: {
    address: string;
    network: string;
    asset: 'USDC';
    balance: string | null;
    credentialId: string;
    createdAt: string;
  } | null;
  canOpen: boolean;
  canWithdraw: boolean;
  topups: { pix: boolean };
  history?: WalletActivity[];
}

export interface PixTopUp {
  id: string;
  amount: string;
  status: string;
  qrCode: string | null;
}

export interface AgentLimits {
  perPayment: string;
  daily: string;
  monthly: string;
  merchants?: string[];
}

export interface WalletAgent {
  id: string;
  agentDid: string;
  clientId: string;
  name: string | null;
  status: 'pending' | 'active' | 'revoked';
  requested: AgentLimits;
  limits: AgentLimits | null;
  spent: { today: string; month: string };
  lastUsedAt: string | null;
  createdAt: string;
}

export type WalletState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: WalletOverview };

/**
 * The person's INITE wallet, from billing: what it holds and what they can do
 * with it. Every money-moving step asks the wallet's passkey; billing only
 * prepares requests and passes on what the passkey signed.
 */
export function useIniteWallet(accessToken: string, label: string) {
  const api = useMemo(() => billing(accessToken), [accessToken]);
  const [state, setState] = useState<WalletState>({ status: 'loading' });

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get<WalletOverview>('/wallet');
      setState({ status: 'ready', data });
    } catch {
      setState({ status: 'error' });
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const open = useCallback(async () => {
    const passkey = await createWalletPasskey(label);
    const { data } = await api.post<WalletOverview>('/wallet', { passkey });
    setState({ status: 'ready', data });
  }, [api, label]);

  const topUpByPix = useCallback(
    async (amount: string) => (await api.post<PixTopUp>('/wallet/topups/pix', { amount })).data,
    [api],
  );

  const topUp = useCallback(
    async (id: string) => (await api.get<PixTopUp>(`/wallet/topups/${id}`)).data,
    [api],
  );

  /** Prepare, approve with the passkey, send. Resolves with the withdrawal as it stands. */
  const withdraw = useCallback(
    async (to: string, amount: string) => {
      const { data: prepared } = await api.post<{
        id: string;
        request: string;
        credentialId: string;
      }>('/wallet/withdrawals', { to, amount });
      const stamp = await stampWithWalletPasskey(prepared.request, prepared.credentialId);
      const { data } = await api.post<WalletActivity>(
        `/wallet/withdrawals/${prepared.id}/confirm`,
        { stamp },
      );
      void reload();
      return data;
    },
    [api, reload],
  );

  const [agents, setAgents] = useState<WalletAgent[]>([]);
  const reloadAgents = useCallback(async () => {
    const { data } = await api.get<WalletAgent[]>('/wallet/agents').catch(() => ({ data: [] }));
    setAgents(data);
  }, [api]);
  const hasWallet = state.status === 'ready' && !!state.data.wallet;
  useEffect(() => {
    if (hasWallet) void reloadAgents();
  }, [hasWallet, reloadAgents]);

  /**
   * Approve an agent with these limits. Turnkey takes two requests in the
   * person's wallet — the agent's user, then its policy — each stamped with
   * the wallet passkey, so the browser asks twice.
   */
  const approveAgent = useCallback(
    async (id: string, limits: AgentLimits) => {
      let next = (
        await api.post<{ step: string; request: string; credentialId: string }>(
          `/wallet/agents/${id}/approve`,
          limits,
        )
      ).data;
      while (next.step !== 'done') {
        const stamp = await stampWithWalletPasskey(next.request, next.credentialId);
        next = (await api.post(`/wallet/agents/${id}/approve/confirm`, { stamp })).data;
      }
      await reloadAgents();
    },
    [api, reloadAgents],
  );

  const revokeAgent = useCallback(
    async (id: string) => {
      await api.post(`/wallet/agents/${id}/revoke`);
      await reloadAgents();
    },
    [api, reloadAgents],
  );

  return {
    state,
    reload,
    open,
    topUpByPix,
    topUp,
    withdraw,
    agents,
    approveAgent,
    revokeAgent,
  };
}
