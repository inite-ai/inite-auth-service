import { resolvePostLogoutRedirect, type LogoutRedirectDeps } from '../logout-redirect';

/**
 * /oauth/logout used to accept any post_logout_redirect_uri whose origin
 * matched any active client's redirect origin, self-registered clients
 * included: an open redirect from auth.inite.ai for anyone who registered.
 */
describe('post-logout redirect is bound to the client that asks', () => {
  const clients: Record<string, string[]> = {
    'inite-shop': ['https://inite.shop/callback'],
    nobodyquits: ['https://nobody-quits.com/callback'],
    dcr_0123456789abcdef0123456789abcdef: ['https://evil.example/cb'],
  };
  const hints: Record<string, string> = {
    'hint-shop': 'inite-shop',
    'hint-dcr': 'dcr_0123456789abcdef0123456789abcdef',
  };
  const trusted = new Set(['https://auth.inite.ai', 'https://nobody-quits.com', 'http://localhost:3000']);
  const deps: LogoutRedirectDeps = {
    findClient: async (id) => (clients[id] ? { clientId: id, redirectUris: clients[id] } : null),
    hintClientId: async (t) => hints[t] ?? null,
    isTrustedOrigin: async (o) => trusted.has(o),
  };
  const go = (input: Parameters<typeof resolvePostLogoutRedirect>[0]) =>
    resolvePostLogoutRedirect(input, deps);

  it('sends a named client back to its own origin, with state', async () => {
    await expect(
      go({ clientId: 'inite-shop', postLogoutRedirectUri: 'https://inite.shop/login', state: 's1' }),
    ).resolves.toBe('https://inite.shop/login?state=s1');
  });

  it('refuses a named client a foreign origin, even a family one', async () => {
    await expect(go({ clientId: 'inite-shop', postLogoutRedirectUri: 'https://evil.example/' })).resolves.toBeNull();
    await expect(go({ clientId: 'inite-shop', postLogoutRedirectUri: 'https://inite.food/' })).resolves.toBeNull();
  });

  it('identifies the client from a valid id_token_hint', async () => {
    await expect(go({ idTokenHint: 'hint-shop', postLogoutRedirectUri: 'https://inite.shop/' })).resolves.toBe(
      'https://inite.shop/',
    );
    await expect(go({ idTokenHint: 'hint-shop', postLogoutRedirectUri: 'https://evil.example/' })).resolves.toBeNull();
  });

  it('refuses when the hint is not ours, or names another client than client_id', async () => {
    await expect(go({ idTokenHint: 'forged', postLogoutRedirectUri: 'https://inite.shop/' })).resolves.toBeNull();
    await expect(
      go({ clientId: 'nobodyquits', idTokenHint: 'hint-shop', postLogoutRedirectUri: 'https://inite.shop/' }),
    ).resolves.toBeNull();
  });

  it('never redirects for a self-registered client, whatever it registered', async () => {
    const dcr = 'dcr_0123456789abcdef0123456789abcdef';
    await expect(go({ clientId: dcr, postLogoutRedirectUri: 'https://evil.example/cb' })).resolves.toBeNull();
    await expect(go({ idTokenHint: 'hint-dcr', postLogoutRedirectUri: 'https://evil.example/cb' })).resolves.toBeNull();
  });

  it('refuses an unknown or inactive client', async () => {
    await expect(go({ clientId: 'ghost', postLogoutRedirectUri: 'https://inite.shop/' })).resolves.toBeNull();
  });

  it('without a client: family domains and first-party origins over https only', async () => {
    await expect(go({ postLogoutRedirectUri: 'https://inite.travel/' })).resolves.toBe('https://inite.travel/');
    await expect(go({ postLogoutRedirectUri: 'https://www.inite.health/login' })).resolves.toBe(
      'https://www.inite.health/login',
    );
    await expect(go({ postLogoutRedirectUri: 'https://nobody-quits.com/' })).resolves.toBe('https://nobody-quits.com/');
    await expect(go({ postLogoutRedirectUri: 'https://evil.example/' })).resolves.toBeNull();
    await expect(go({ postLogoutRedirectUri: 'https://inite.ai.evil.example/' })).resolves.toBeNull();
    await expect(go({ postLogoutRedirectUri: 'http://inite.travel/' })).resolves.toBeNull();
    await expect(go({ postLogoutRedirectUri: 'http://localhost:3000/' })).resolves.toBeNull();
  });

  it('refuses junk and non-web schemes', async () => {
    await expect(go({ postLogoutRedirectUri: 'not a url' })).resolves.toBeNull();
    await expect(go({ postLogoutRedirectUri: 'javascript:alert(1)' })).resolves.toBeNull();
    await expect(go({})).resolves.toBeNull();
  });
});
