import { ConflictException, NotFoundException } from '@nestjs/common';
import { ScimUsersService } from '../scim-users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IdentityService } from '../../identity/identity.service';
import { SsfEmitterService } from '../../ssf/ssf-emitter.service';
import { CAEP_EVENTS } from '../../ssf/caep-event-types';

const BASE = 'https://auth.example.com';
const org = { id: 'org-1', companyId: 'co-1' };
const user = {
  id: 'u1',
  did: 'did:key:abc',
  email: 'a@b.com',
  name: 'Ada',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function setup(overrides: Record<string, unknown> = {}) {
  const prisma = {
    organization: { findUnique: jest.fn().mockResolvedValue(org) },
    membership: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'm1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 'm1', ...data })),
    },
    user: { update: jest.fn() },
    ...overrides,
  };
  const identity = {
    getIdentityByEmail: jest.fn().mockResolvedValue(null),
    createIdentity: jest.fn().mockResolvedValue(user),
  };
  const ssf = { emit: jest.fn().mockResolvedValue(undefined) };
  const svc = new ScimUsersService(
    prisma as unknown as PrismaService,
    identity as unknown as IdentityService,
    ssf as unknown as SsfEmitterService,
  );
  return { svc, prisma, identity, ssf };
}

describe('ScimUsersService', () => {
  it('creates a user + tenant membership and returns the SCIM resource', async () => {
    const { svc, identity, prisma } = setup();
    const result = await svc.createUser(
      'co-1',
      { userName: 'a@b.com', externalId: 'ext-1', name: { formatted: 'Ada' } },
      BASE,
    );
    expect(identity.createIdentity).toHaveBeenCalledWith('a@b.com', 'Ada');
    expect(prisma.membership.create).toHaveBeenCalled();
    expect(result.userName).toBe('a@b.com');
    expect(result.externalId).toBe('ext-1');
    expect(result.active).toBe(true);
  });

  it('reuses an existing user instead of recreating', async () => {
    const { svc, identity } = setup();
    identity.getIdentityByEmail.mockResolvedValue(user);
    await svc.createUser('co-1', { userName: 'a@b.com' }, BASE);
    expect(identity.createIdentity).not.toHaveBeenCalled();
  });

  it('409s when an active membership already exists (uniqueness)', async () => {
    const { svc, identity, prisma } = setup();
    identity.getIdentityByEmail.mockResolvedValue(user);
    prisma.membership.findUnique.mockResolvedValue({ id: 'm1', status: 'active' });
    await expect(
      svc.createUser('co-1', { userName: 'a@b.com' }, BASE),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reactivates an inactive membership on re-provision', async () => {
    const { svc, identity, prisma } = setup();
    identity.getIdentityByEmail.mockResolvedValue(user);
    prisma.membership.findUnique.mockResolvedValue({ id: 'm1', status: 'inactive', externalId: null });
    const result = await svc.createUser('co-1', { userName: 'a@b.com' }, BASE);
    expect(prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'active' }) }),
    );
    expect(result.active).toBe(true);
  });

  it('404s when the tenant has no organization', async () => {
    const { svc, prisma } = setup();
    prisma.organization.findUnique.mockResolvedValue(null);
    await expect(svc.createUser('co-x', { userName: 'a@b.com' }, BASE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('filters list by userName eq', async () => {
    const { svc, prisma } = setup();
    prisma.membership.findMany.mockResolvedValue([{ ...{ id: 'm1', status: 'active', externalId: null }, user }]);
    prisma.membership.count.mockResolvedValue(1);
    const list = await svc.listUsers('co-1', { filter: 'userName eq "a@b.com"' }, BASE);
    expect(prisma.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1', user: { email: 'a@b.com' } } }),
    );
    expect(list.totalResults).toBe(1);
    expect((list.Resources as unknown[]).length).toBe(1);
  });

  it('deactivateUser flips the membership and emits a CAEP account-disabled event', async () => {
    const { svc, prisma, ssf } = setup();
    prisma.membership.findFirst.mockResolvedValue({ id: 'm1', status: 'active', externalId: null, user });
    await svc.deactivateUser('co-1', 'u1');
    expect(prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'inactive' }) }),
    );
    expect(ssf.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: CAEP_EVENTS.accountDisabled,
        subject: 'did:key:abc',
        companyId: 'co-1',
      }),
    );
  });

  it('getUser 404s when the user has no membership in the tenant', async () => {
    const { svc, prisma } = setup();
    prisma.membership.findFirst.mockResolvedValue(null);
    await expect(svc.getUser('co-1', 'nope', BASE)).rejects.toBeInstanceOf(NotFoundException);
  });
});
