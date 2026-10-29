import { BadRequestException } from '@nestjs/common';
import { refreshBounds } from '../refresh-bounds';

/** A refresh obeys the authorization_code rule: it can only narrow. */
describe('refresh is held to what the client may hold today', () => {
  const shop = {
    clientId: 'inite-shop',
    allowedScopes: ['openid', 'profile', 'email', 'offline_access'],
    allowedAudiences: [],
    redirectUris: ['https://inite.shop/callback'],
  };

  it('drops a scope outside allowedScopes that an old token still carries', () => {
    expect(refreshBounds(shop, { scope: 'openid offline_access brain:admin', resource: null })).toEqual({
      scope: 'openid offline_access',
      resource: undefined,
    });
  });

  it('never adds a default scope', () => {
    expect(refreshBounds(shop, { scope: 'brain:admin', resource: null }).scope).toBe('');
  });

  it('keeps a resource the client may still target', () => {
    expect(refreshBounds(shop, { scope: 'openid', resource: 'https://inite.shop/mcp' }).resource).toBe(
      'https://inite.shop/mcp',
    );
  });

  it('ends the grant when the bound resource is no longer allowed', () => {
    expect(() => refreshBounds(shop, { scope: 'openid', resource: 'brain' })).toThrow(BadRequestException);
    expect(() => refreshBounds(shop, { scope: 'openid', resource: 'https://brain.inite.ai/mcp' })).toThrow(
      BadRequestException,
    );
  });

  it('leaves a dcr client on the open-registration rule', () => {
    const dcr = { clientId: 'dcr_x', allowedScopes: ['openid'], allowedAudiences: [], isPublic: true };
    expect(
      refreshBounds(dcr, { scope: 'brain:read brain:write offline_access', resource: 'https://brain.inite.ai/mcp' }),
    ).toEqual({ scope: 'brain:read brain:write offline_access', resource: 'https://brain.inite.ai/mcp' });
  });
});
