import { FederationAdminService } from '../federation-admin.service';

/** Build the service with lightweight mocks for its four collaborators. */
function setup(overrides: {
  findUnique?: any;
  envConfig?: any;
} = {}) {
  const create = jest.fn().mockResolvedValue({});
  const update = jest.fn().mockResolvedValue({});
  const upsert = jest.fn().mockResolvedValue({});
  const findUnique = jest.fn().mockResolvedValue(overrides.findUnique ?? null);
  const prisma = { federationProvider: { create, update, upsert, findUnique } } as any;

  const crypto = {
    encrypt: (s: string) => `enc:${s}`,
    decrypt: (s: string) => s.replace(/^enc:/, ''),
  } as any;

  const providers = {
    envConfig: jest.fn().mockReturnValue(overrides.envConfig ?? null),
    redirectUri: (slug: string) => `https://auth.example.com/v1/auth/oauth/${slug}/callback`,
    resolveForTest: jest.fn(),
    getEndpoints: jest.fn(),
  } as any;

  const store = { invalidate: jest.fn().mockResolvedValue(undefined) } as any;

  const svc = new FederationAdminService(prisma, crypto, providers, store);
  return { svc, create, update, upsert, findUnique, providers, store };
}

describe('FederationAdminService', () => {
  it('reports env source when no DB row exists but env creds are present', async () => {
    const { svc } = setup({
      envConfig: {
        id: 'google',
        displayName: 'Google',
        clientId: 'env-id',
        clientSecret: 'env-secret',
        scopes: ['openid'],
        usesPkce: true,
        endpoints: null,
      },
    });
    const summary = await svc['describe']('google');
    expect(summary.source).toBe('env');
    expect(summary.enabled).toBe(true);
    expect(summary.clientId).toBe('env-id');
    expect(summary.hasSecret).toBe(true);
    expect((summary as any).clientSecret).toBeUndefined();
  });

  it('reports unset source when neither DB nor env configured', async () => {
    const { svc } = setup();
    const summary = await svc['describe']('github');
    expect(summary.source).toBe('unset');
    expect(summary.enabled).toBe(false);
    expect(summary.hasSecret).toBe(false);
  });

  it('encrypts the secret on upsert and never returns it', async () => {
    const row = {
      slug: 'google',
      displayName: 'Google',
      enabled: true,
      clientId: 'id',
      clientSecretEnc: 'enc:s3cret',
      scopes: [],
      issuer: null,
    };
    const { svc, upsert, findUnique, store } = setup({ findUnique: row });
    const summary = await svc.upsert('google', { clientId: 'id', clientSecret: 's3cret', enabled: true });
    const call = upsert.mock.calls[0][0];
    expect(call.create.clientSecretEnc).toBe('enc:s3cret');
    expect(store.invalidate).toHaveBeenCalled();
    expect(summary.source).toBe('db');
    expect(summary.hasSecret).toBe(true);
    expect((summary as any).clientSecret).toBeUndefined();
    expect(findUnique).toHaveBeenCalled();
  });

  it('seeds a disabled row from env when disabling an env-only provider', async () => {
    const { svc, create } = setup({
      envConfig: {
        id: 'google',
        displayName: 'Google',
        clientId: 'env-id',
        clientSecret: 'env-secret',
        scopes: ['openid'],
        usesPkce: true,
        endpoints: null,
      },
    });
    await svc.setEnabled('google', false);
    const data = create.mock.calls[0][0].data;
    expect(data.enabled).toBe(false);
    expect(data.clientSecretEnc).toBe('enc:env-secret');
  });

  it('reports OIDC discovery reachability from test()', async () => {
    const { svc, providers } = setup();
    providers.resolveForTest.mockReturnValue({ id: 'oidc', issuer: 'https://idp', clientId: 'a', clientSecret: 'b' });
    providers.getEndpoints.mockResolvedValue({ authorizationEndpoint: 'x', tokenEndpoint: 'y' });
    await expect(svc.test('oidc')).resolves.toEqual({ ok: true, detail: expect.any(String) });

    providers.getEndpoints.mockRejectedValue(new Error('boom'));
    const bad = await svc.test('oidc');
    expect(bad.ok).toBe(false);
  });

  it('rejects an unknown provider slug', async () => {
    const { svc } = setup();
    await expect(svc.upsert('facebook', { clientId: 'x' })).rejects.toThrow(/Unknown/);
  });
});
