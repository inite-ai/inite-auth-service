import { FederationService } from '../federation.service';
import { FederationEmailConflictError } from '../contracts/federation-email-conflict.error';
import { NormalizedProfile } from '../contracts/normalized-profile';

/**
 * Unit coverage for the account-linking / JIT-create logic — the security-
 * sensitive heart of social login. We drive resolveUser() directly with a
 * mocked Prisma + IdentityService so each branch is exercised in isolation
 * (no network, no DB):
 *   - returning user (known provider+subject)
 *   - link to existing local user by VERIFIED email
 *   - JIT-create when no local user exists
 *   - REFUSE linking on an UNVERIFIED email collision (takeover guard)
 *   - JIT-create when the provider gives no email at all
 */

function profile(overrides: Partial<NormalizedProfile> = {}): NormalizedProfile {
  return {
    provider: 'google',
    subject: 'sub-123',
    email: 'alice@example.com',
    emailVerified: true,
    displayName: 'Alice',
    avatarUrl: 'https://img/avatar.png',
    raw: { sub: 'sub-123', name: 'Alice' },
    ...overrides,
  };
}

function makeService() {
  const oAuthIdentity = {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const user = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { oAuthIdentity, user } as any;
  const identityService = { createIdentity: jest.fn() } as any;
  const config = { get: jest.fn() } as any;
  const redis = {} as any;

  const service = new FederationService(config, prisma, redis, identityService);
  return { service, prisma, identityService, oAuthIdentity, user };
}

describe('FederationService.resolveUser', () => {
  it('returns the existing user for a known (provider, subject) and refreshes the snapshot', async () => {
    const { service, oAuthIdentity } = makeService();
    const existingUser = {
      id: 'u1',
      did: 'did:key:1',
      email: 'alice@example.com',
      name: 'Alice',
    };
    oAuthIdentity.findUnique.mockResolvedValue({
      id: 'oi1',
      user: existingUser,
    });

    const res = await service.resolveUser(profile());

    expect(res).toEqual({ user: existingUser, isNewUser: false });
    expect(oAuthIdentity.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'oi1' } }),
    );
    expect(oAuthIdentity.create).not.toHaveBeenCalled();
  });

  it('links to an existing local user when the email is verified', async () => {
    const { service, oAuthIdentity, user, identityService } = makeService();
    oAuthIdentity.findUnique.mockResolvedValue(null);
    user.findUnique.mockResolvedValue({
      id: 'u2',
      did: 'did:key:2',
      email: 'alice@example.com',
      name: 'Alice',
    });

    const res = await service.resolveUser(profile({ emailVerified: true }));

    expect(res.isNewUser).toBe(false);
    expect(res.user.id).toBe('u2');
    expect(oAuthIdentity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u2',
          provider: 'google',
          providerSubject: 'sub-123',
        }),
      }),
    );
    expect(identityService.createIdentity).not.toHaveBeenCalled();
  });

  it('JIT-creates a new user (with DID) when no local account exists', async () => {
    const { service, oAuthIdentity, user, identityService } = makeService();
    oAuthIdentity.findUnique.mockResolvedValue(null);
    user.findUnique.mockResolvedValue(null);
    const created = {
      id: 'u3',
      did: 'did:key:3',
      email: 'alice@example.com',
      name: 'Alice',
    };
    identityService.createIdentity.mockResolvedValue(created);
    user.update.mockResolvedValue(created);

    const res = await service.resolveUser(profile({ emailVerified: true }));

    expect(res.isNewUser).toBe(true);
    expect(res.user.id).toBe('u3');
    expect(identityService.createIdentity).toHaveBeenCalledWith(
      'alice@example.com',
      'Alice',
    );
    expect(oAuthIdentity.create).toHaveBeenCalled();
  });

  it('refuses to link when the email matches a local user but is UNVERIFIED', async () => {
    const { service, oAuthIdentity, user, identityService } = makeService();
    oAuthIdentity.findUnique.mockResolvedValue(null);
    user.findUnique.mockResolvedValue({
      id: 'u4',
      did: 'did:key:4',
      email: 'alice@example.com',
      name: 'Alice',
    });

    await expect(
      service.resolveUser(profile({ emailVerified: false })),
    ).rejects.toBeInstanceOf(FederationEmailConflictError);

    expect(oAuthIdentity.create).not.toHaveBeenCalled();
    expect(identityService.createIdentity).not.toHaveBeenCalled();
  });

  it('JIT-creates when the provider returns no email (e.g. private GitHub email)', async () => {
    const { service, oAuthIdentity, user, identityService } = makeService();
    oAuthIdentity.findUnique.mockResolvedValue(null);
    const created = { id: 'u5', did: 'did:key:5', email: null, name: 'ghuser' };
    identityService.createIdentity.mockResolvedValue(created);
    user.update.mockResolvedValue(created);

    const res = await service.resolveUser(
      profile({
        provider: 'github',
        subject: '99',
        email: null,
        emailVerified: false,
        displayName: 'ghuser',
        avatarUrl: null,
      }),
    );

    expect(res.isNewUser).toBe(true);
    // No email → never look up an existing user by email.
    expect(user.findUnique).not.toHaveBeenCalled();
    expect(identityService.createIdentity).toHaveBeenCalledWith(undefined, 'ghuser');
    expect(oAuthIdentity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u5', provider: 'github' }),
      }),
    );
  });
});
