import {
  WalletGrantError,
  normalizeWalletGrant,
  rawHasWalletGrant,
  withWalletAcr,
  withWalletScopeGrant,
} from '../wallet-grant';
import { AuthorizationDetailsService } from '../authorization-details.service';
import { fakeSettings } from '../../common/settings/settings.test-fixture';

describe('inite_wallet grant', () => {
  it('fills in the default limits, USDC on Base', () => {
    expect(normalizeWalletGrant({ type: 'inite_wallet' })).toEqual({
      type: 'inite_wallet',
      limits: { currency: 'USD', per_payment: '10', daily: '20', monthly: '50' },
      asset: 'USDC',
      network: 'eip155:8453',
    });
  });

  it('keeps given limits and merchant origins', () => {
    const grant = normalizeWalletGrant({
      type: 'inite_wallet',
      limits: { per_payment: '2.50', daily: 5, monthly: '100' },
      merchants: ['https://shop.example/path', 'https://neuralcosmology.com'],
    });
    expect(grant.limits).toEqual({
      currency: 'USD',
      per_payment: '2.5',
      daily: '5',
      monthly: '100',
    });
    expect(grant.merchants).toEqual(['https://shop.example', 'https://neuralcosmology.com']);
  });

  it.each([
    [{ limits: { per_payment: '0' } }, 'more than 0'],
    [{ limits: { per_payment: '5000', daily: '6000', monthly: '9000' } }, 'at most 1000'],
    [{ limits: { per_payment: '1.234' } }, 'amount in dollars'],
    [{ limits: { per_payment: '30', daily: '20' } }, 'per_payment ≤ daily ≤ monthly'],
    [{ limits: { currency: 'EUR' } }, 'USD'],
    [{ asset: 'ETH' }, 'USDC only'],
    [{ network: 'eip155:1' }, 'eip155:8453 only'],
    [{ merchants: ['http://plain.example'] }, 'must be https'],
    [{ merchants: [] }, 'site origins'],
  ])('refuses %j', (extra, message) => {
    expect(() => normalizeWalletGrant({ type: 'inite_wallet', ...extra })).toThrow(
      WalletGrantError,
    );
    expect(() => normalizeWalletGrant({ type: 'inite_wallet', ...extra })).toThrow(message);
  });

  it('is validated as an authorization_details entry, with the RFC 9396 error', () => {
    const rar = new AuthorizationDetailsService(fakeSettings({ RAR_ENABLED: 'true' }));
    expect(rar.parse(JSON.stringify([{ type: 'inite_wallet', limits: { daily: '15' } }]))).toEqual([
      expect.objectContaining({
        limits: { currency: 'USD', per_payment: '10', daily: '15', monthly: '50' },
      }),
    ]);
    expect(() =>
      rar.parse(JSON.stringify([{ type: 'inite_wallet', limits: { per_payment: '-1' } }])),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ error: 'invalid_authorization_details' }),
      }),
    );
  });

  it('turns the wallet:pay scope into a default grant, keeping other details', () => {
    expect(withWalletScopeGrant('openid', undefined)).toBeUndefined();
    expect(JSON.parse(withWalletScopeGrant('openid wallet:pay', undefined)!)).toEqual([
      { type: 'inite_wallet' },
    ]);
    const other = JSON.stringify([{ type: 'inite_mcp_resource' }]);
    expect(JSON.parse(withWalletScopeGrant('wallet:pay', other)!)).toEqual([
      { type: 'inite_mcp_resource' },
      { type: 'inite_wallet' },
    ]);
    // A grant the client already asked for, with its own limits, stands.
    const own = JSON.stringify([{ type: 'inite_wallet', limits: { daily: '15' } }]);
    expect(withWalletScopeGrant('wallet:pay', own)).toBe(own);
    // Garbage goes on to the parser, which refuses it.
    expect(withWalletScopeGrant('wallet:pay', 'nope')).toBe('nope');
    // The default grant then validates like any other.
    const rar = new AuthorizationDetailsService(fakeSettings({ RAR_ENABLED: 'true' }));
    expect(rar.parse(withWalletScopeGrant('wallet:pay', undefined))![0]).toMatchObject({
      limits: { per_payment: '10', daily: '20', monthly: '50' },
    });
  });

  it('asks for a passkey on /authorize when the wallet is requested', () => {
    expect(rawHasWalletGrant(JSON.stringify([{ type: 'inite_wallet' }]))).toBe(true);
    expect(rawHasWalletGrant(JSON.stringify([{ type: 'inite_mcp_resource' }]))).toBe(false);
    expect(rawHasWalletGrant('not json')).toBe(false);
    expect(withWalletAcr(undefined)).toBe('phr');
    expect(withWalletAcr('aal2')).toBe('phr aal2');
    expect(withWalletAcr('phr')).toBe('phr');
  });
});
