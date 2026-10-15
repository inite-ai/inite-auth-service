import type { AuthorizationDetail } from './contracts/authorization-detail';

/**
 * The `inite_wallet` authorization_details type: what an agent may spend from
 * the person's INITE wallet (USDC on Base, held in INITE billing).
 *
 *   { type: 'inite_wallet',
 *     limits: { currency: 'USD', per_payment: '10', daily: '20', monthly: '50' },
 *     asset: 'USDC', network: 'eip155:8453',
 *     merchants?: ['https://shop.example'] }   // only these sites, when given
 *
 * The grant here is the only record of the limits: billing reads them from
 * the token and enforces them; Auth shows them to the person on the consent
 * screen and in the account. A grant like this needs a passkey to approve.
 */
export const WALLET_AUTHORIZATION_DETAILS_TYPE = 'inite_wallet';

export const WALLET_ASSET = 'USDC';
export const WALLET_NETWORK = 'eip155:8453';

/** The assurance a wallet grant needs: a phishing-resistant factor (passkey). */
export const WALLET_ACR = 'phr';

/** acr_values with the wallet's requirement added, for an /authorize that asks for the wallet. */
export function withWalletAcr(acrValues: string | undefined): string {
  const values = (acrValues ?? '').split(/\s+/).filter(Boolean);
  return values.includes(WALLET_ACR) ? values.join(' ') : [WALLET_ACR, ...values].join(' ');
}

/** The scope an MCP client asks for to pay from the wallet; stands for a default grant. */
export const WALLET_SCOPE = 'wallet:pay';

/**
 * The raw `authorization_details` for an /authorize that asks for
 * `wallet:pay`: the given details plus a default `inite_wallet` grant, unless
 * one is already there. MCP clients request scopes only; this is how their
 * request for the wallet reaches the consent screen, its limits and its
 * passkey. Malformed details are passed through for the parser to refuse.
 */
export function withWalletScopeGrant(scope: string, raw: string | undefined): string | undefined {
  if (!scope.split(/\s+/).includes(WALLET_SCOPE) || rawHasWalletGrant(raw)) return raw;
  let details: unknown[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return raw;
      details = parsed;
    } catch {
      return raw;
    }
  }
  return JSON.stringify([...details, { type: WALLET_AUTHORIZATION_DETAILS_TYPE }]);
}

/** What an agent gets when it asks for the wallet without naming limits. */
export const DEFAULT_WALLET_LIMITS = { per_payment: '10', daily: '20', monthly: '50' };

/** The most a person can grant one agent, in US dollars. */
export const MAX_WALLET_LIMITS = { per_payment: 1_000, daily: 2_000, monthly: 10_000 };

const AMOUNT = /^\d{1,7}(\.\d{1,2})?$/;
const MAX_MERCHANTS = 50;

export interface WalletLimits {
  currency: 'USD';
  per_payment: string;
  daily: string;
  monthly: string;
}

export interface WalletGrant extends AuthorizationDetail {
  type: typeof WALLET_AUTHORIZATION_DETAILS_TYPE;
  limits: WalletLimits;
  asset: typeof WALLET_ASSET;
  network: typeof WALLET_NETWORK;
  merchants?: string[];
}

export class WalletGrantError extends Error {}

export function isWalletGrant(detail: { type?: unknown }): boolean {
  return detail?.type === WALLET_AUTHORIZATION_DETAILS_TYPE;
}

/** Whether any of these details asks for the wallet. */
export function hasWalletGrant(details: unknown): boolean {
  return Array.isArray(details) && details.some((d) => isWalletGrant(d as { type?: unknown }));
}

/** The same check on the raw `authorization_details` parameter, before it is parsed. */
export function rawHasWalletGrant(raw: string | undefined | null): boolean {
  if (!raw) return false;
  try {
    return hasWalletGrant(JSON.parse(raw));
  } catch {
    return false;
  }
}

function amount(value: unknown, field: keyof typeof MAX_WALLET_LIMITS): string {
  const text = value === undefined ? DEFAULT_WALLET_LIMITS[field] : String(value).trim();
  if (!AMOUNT.test(text)) {
    throw new WalletGrantError(`inite_wallet limits.${field} must be an amount in dollars`);
  }
  const n = Number(text);
  if (n <= 0 || n > MAX_WALLET_LIMITS[field]) {
    throw new WalletGrantError(
      `inite_wallet limits.${field} must be more than 0 and at most ${MAX_WALLET_LIMITS[field]}`,
    );
  }
  return String(n);
}

function merchants(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MERCHANTS) {
    throw new WalletGrantError(`inite_wallet merchants must be 1–${MAX_MERCHANTS} site origins`);
  }
  return value.map((m) => {
    let url: URL;
    try {
      url = new URL(String(m));
    } catch {
      throw new WalletGrantError(`inite_wallet merchant ${String(m)} is not a URL`);
    }
    if (url.protocol !== 'https:') {
      throw new WalletGrantError(`inite_wallet merchant ${url.origin} must be https`);
    }
    return url.origin;
  });
}

/** The parts of a grant that can only have one value: USD limits, USDC, Base. */
function assertFixed(detail: Record<string, unknown>, limits: Record<string, unknown>): void {
  if (typeof limits !== 'object' || Array.isArray(limits)) {
    throw new WalletGrantError('inite_wallet limits must be an object');
  }
  if (limits.currency !== undefined && limits.currency !== 'USD') {
    throw new WalletGrantError('inite_wallet limits are in USD');
  }
  if (detail.asset !== undefined && detail.asset !== WALLET_ASSET) {
    throw new WalletGrantError('inite_wallet pays in USDC only');
  }
  if (detail.network !== undefined && detail.network !== WALLET_NETWORK) {
    throw new WalletGrantError(`inite_wallet pays on ${WALLET_NETWORK} only`);
  }
}

/**
 * Validate and normalise an `inite_wallet` grant: limits in whole dollars and
 * cents, filled with the defaults when left out, each under its maximum, a
 * payment never above the day nor the day above the month; USDC on Base only.
 * Throws {@link WalletGrantError}.
 */
export function normalizeWalletGrant(detail: Record<string, unknown>): WalletGrant {
  const limits = (detail.limits ?? {}) as Record<string, unknown>;
  assertFixed(detail, limits);
  const perPayment = amount(limits.per_payment, 'per_payment');
  const daily = amount(limits.daily, 'daily');
  const monthly = amount(limits.monthly, 'monthly');
  if (Number(perPayment) > Number(daily) || Number(daily) > Number(monthly)) {
    throw new WalletGrantError('inite_wallet limits must satisfy per_payment ≤ daily ≤ monthly');
  }
  const sites = merchants(detail.merchants);
  return {
    type: WALLET_AUTHORIZATION_DETAILS_TYPE,
    ...(Array.isArray(detail.locations) ? { locations: detail.locations as string[] } : {}),
    limits: { currency: 'USD', per_payment: perPayment, daily, monthly },
    asset: WALLET_ASSET,
    network: WALLET_NETWORK,
    ...(sites ? { merchants: sites } : {}),
  };
}
