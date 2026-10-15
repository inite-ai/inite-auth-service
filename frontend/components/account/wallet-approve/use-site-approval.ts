'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { billing } from '@/lib/billing';
import { stampWithWalletPasskey } from '@/lib/wallet-passkey';

export interface SitePreview {
  service: { code: string; name: string };
  wallet: { address: string; balance: string | null; credentialId: string } | null;
  checkout: 'none' | 'pending' | 'active' | 'revoked';
  allowed: { perPayment: string; monthly: string; spentThisMonth: string } | null;
  session: { id: string; product: string; amount: string; currency: string; status: string } | null;
  maxPerPayment: string;
}

export type PayResult =
  | { status: 'paid' | 'confirming'; orderId: string; txHash: string | null }
  | { status: 'needs_approval'; reason: string; approveUrl: string };

/** Where the approve page sends the person back to after signing in. */
export const AFTER_LOGIN_KEY = 'inite_after_login';

/**
 * A site asking to charge the person's INITE wallet: what billing says about
 * it, and the steps the page takes — allowing INITE checkout (two wallet
 * passkey stamps, once per wallet), the site's limits, paying this session.
 */
export function useSiteApproval(accessToken: string | null, service: string, session?: string) {
  const api = useMemo(() => (accessToken ? billing(accessToken) : null), [accessToken]);
  const [preview, setPreview] = useState<SitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!api) return;
    try {
      const query = session ? `?session=${encodeURIComponent(session)}` : '';
      setPreview(
        (await api.get<SitePreview>(`/wallet/sites/${encodeURIComponent(service)}${query}`)).data,
      );
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Failed');
    }
  }, [api, service, session]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const allowCheckout = useCallback(async () => {
    if (!api) return;
    let next = (
      await api.post<{ step: string; request?: string; credentialId?: string }>(
        '/wallet/checkout/approve',
      )
    ).data;
    while (next.step !== 'done') {
      const stamp = await stampWithWalletPasskey(next.request!, next.credentialId!);
      next = (await api.post('/wallet/checkout/approve/confirm', { stamp })).data;
    }
    await reload();
  }, [api, reload]);

  const allowSite = useCallback(
    async (limits: { perPayment: string; monthly: string }) => {
      if (!api) return;
      setPreview(
        (await api.put<SitePreview>(`/wallet/sites/${encodeURIComponent(service)}`, limits)).data,
      );
      await reload();
    },
    [api, service, reload],
  );

  const revokeSite = useCallback(async () => {
    if (!api) return;
    await api.delete(`/wallet/sites/${encodeURIComponent(service)}`);
    await reload();
  }, [api, service, reload]);

  const pay = useCallback(async (): Promise<PayResult | null> => {
    if (!api || !session) return null;
    const result = (
      await api.post<PayResult>(`/wallet/sites/${encodeURIComponent(service)}/pay`, {
        sessionId: session,
      })
    ).data;
    await reload();
    return result;
  }, [api, service, session, reload]);

  return { preview, error, reload, allowCheckout, allowSite, revokeSite, pay };
}
