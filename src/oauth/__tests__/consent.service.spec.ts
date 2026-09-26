import { ConsentService } from '../consent.service';

function prismaMock(opts: {
  client?: { clientId: string; firstParty: boolean } | null;
  consent?: { scopes: string[] } | null;
}) {
  return {
    oAuthClient: { findUnique: jest.fn().mockResolvedValue(opts.client ?? null) },
    oAuthConsent: {
      findUnique: jest.fn().mockResolvedValue(opts.consent ?? null),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockReturnValue('delete-op'),
      findMany: jest.fn().mockResolvedValue([]),
    },
    refreshToken: { updateMany: jest.fn().mockReturnValue('revoke-op') },
    $transaction: jest.fn().mockResolvedValue([{ count: 1 }, { count: 3 }]),
  };
}

const ask = { userId: 'u1', clientId: 'app', scope: 'openid profile email' };

describe('ConsentService.isRequired', () => {
  it('does not ask for a first-party client', async () => {
    const svc = new ConsentService(
      prismaMock({ client: { clientId: 'inite-billing', firstParty: true } }) as never,
    );
    await expect(svc.isRequired({ ...ask, clientId: 'inite-billing' })).resolves.toBe(false);
  });

  it('asks a dynamically registered client even if it is marked first-party', async () => {
    const svc = new ConsentService(
      prismaMock({ client: { clientId: 'dcr_abc', firstParty: true } }) as never,
    );
    await expect(svc.isRequired({ ...ask, clientId: 'dcr_abc' })).resolves.toBe(true);
  });

  it('asks when there is no consent on record', async () => {
    const svc = new ConsentService(
      prismaMock({ client: { clientId: 'app', firstParty: false } }) as never,
    );
    await expect(svc.isRequired(ask)).resolves.toBe(true);
  });

  it('does not ask again for scopes already approved', async () => {
    const svc = new ConsentService(
      prismaMock({
        client: { clientId: 'app', firstParty: false },
        consent: { scopes: ['openid', 'profile', 'email', 'offline_access'] },
      }) as never,
    );
    await expect(svc.isRequired(ask)).resolves.toBe(false);
  });

  it('asks again when a new scope is requested', async () => {
    const svc = new ConsentService(
      prismaMock({
        client: { clientId: 'app', firstParty: false },
        consent: { scopes: ['openid'] },
      }) as never,
    );
    await expect(svc.isRequired(ask)).resolves.toBe(true);
  });

  it('always asks for a request carrying authorization_details', async () => {
    const svc = new ConsentService(
      prismaMock({ client: { clientId: 'inite-billing', firstParty: true } }) as never,
    );
    await expect(
      svc.isRequired({ ...ask, clientId: 'inite-billing', authorizationDetails: '[{"type":"x"}]' }),
    ).resolves.toBe(true);
  });

  it('asks for an unknown client', async () => {
    const svc = new ConsentService(prismaMock({ client: null }) as never);
    await expect(svc.isRequired(ask)).resolves.toBe(true);
  });
});

describe('ConsentService.record / revoke', () => {
  it('adds new scopes to the ones approved before', async () => {
    const prisma = prismaMock({ consent: { scopes: ['openid'] } });
    await new ConsentService(prisma as never).record('u1', 'app', 'openid email');
    expect(prisma.oAuthConsent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { scopes: ['openid', 'email'] },
        create: { userId: 'u1', clientId: 'app', scopes: ['openid', 'email'] },
      }),
    );
  });

  it('forgets the consent and revokes the application’s refresh tokens together', async () => {
    const prisma = prismaMock({});
    const result = await new ConsentService(prisma as never).revoke('u1', 'app');
    expect(prisma.$transaction).toHaveBeenCalledWith(['delete-op', 'revoke-op']);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', clientId: 'app', revoked: false } }),
    );
    expect(result).toEqual({ revokedTokens: 3 });
  });
});
