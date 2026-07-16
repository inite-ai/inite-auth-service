import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { ApiKeysService } from '../api-keys.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let mockPrisma: {
    organization: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    apiKey: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  const org = { id: 'org-uuid-1', companyId: 'co_acme', slug: 'acme', name: 'Acme' };

  const storedKey = {
    id: 'key-uuid-1',
    keyHash: 'irrelevant',
    prefix: 'ik_abcdef',
    name: 'brain ingest key',
    userId: null,
    organizationId: 'org-uuid-1',
    audience: 'brain',
    scopes: ['brain:read', 'brain:write'],
    expiresAt: null,
    revoked: false,
    revokedAt: null,
    lastUsedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    mockPrisma = {
      organization: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      apiKey: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(storedKey),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiKeysService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(ApiKeysService);
  });

  describe('issue', () => {
    it('creates a hashed key and returns the raw value exactly once', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(org);
      mockPrisma.apiKey.create.mockImplementation(({ data }: { data: object }) =>
        Promise.resolve({ ...storedKey, ...data }),
      );

      const { apiKey, rawKey } = await service.issue({
        name: 'brain ingest key',
        companyId: 'co_acme',
        audience: 'brain',
        scopes: ['brain:read', 'brain:write'],
      });

      expect(rawKey).toMatch(/^ik_[\w-]{40,}$/);
      const created = mockPrisma.apiKey.create.mock.calls[0][0].data;
      expect(created.keyHash).toBe(
        crypto.createHash('sha256').update(rawKey).digest('hex'),
      );
      expect(created.prefix).toBe(rawKey.slice(0, 9));
      expect(created.organizationId).toBe('org-uuid-1');
      expect(apiKey).not.toHaveProperty('keyHash');
    });

    it('rejects an unknown owner userId with a 400, not an FK 500', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(org);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.issue({
          name: 'k',
          companyId: 'co_acme',
          audience: 'brain',
          scopes: ['brain:read'],
          userId: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toThrow(/Unknown userId/);
      expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown tenant', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);
      await expect(
        service.issue({
          name: 'k',
          companyId: 'co_nope',
          audience: 'brain',
          scopes: ['brain:read'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects scopes outside the registry', async () => {
      await expect(
        service.issue({
          name: 'k',
          companyId: 'co_acme',
          audience: 'brain',
          scopes: ['brain:read', 'warp:drive'],
        }),
      ).rejects.toThrow(/Unknown scope/);
    });
  });

  describe('introspectionClaims', () => {
    it('maps an active org-bound key to M2M-shaped claims', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue({
        ...storedKey,
        organization: org,
        user: null,
      });

      const claims = await service.introspectionClaims('ik_raw_key_value');
      expect(claims).toMatchObject({
        sub: 'co_acme',
        org: 'co_acme',
        org_id: 'org-uuid-1',
        aud: 'brain',
        scope: 'brain:read brain:write',
        token_type: 'api_key',
      });
    });

    it('answers sub=user.did for a user-bound key', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue({
        ...storedKey,
        userId: 'user-uuid-1',
        organization: org,
        user: { did: 'did:key:z6MkUser' },
      });

      const claims = await service.introspectionClaims('ik_raw_key_value');
      expect(claims?.sub).toBe('did:key:z6MkUser');
      expect(claims?.org).toBe('co_acme');
    });

    it('returns null for revoked, expired and unknown keys', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue({
        ...storedKey,
        revoked: true,
        organization: org,
        user: null,
      });
      expect(await service.introspectionClaims('ik_x')).toBeNull();

      mockPrisma.apiKey.findUnique.mockResolvedValue({
        ...storedKey,
        expiresAt: new Date('2020-01-01T00:00:00Z'),
        organization: org,
        user: null,
      });
      expect(await service.introspectionClaims('ik_x')).toBeNull();

      mockPrisma.apiKey.findUnique.mockResolvedValue(null);
      expect(await service.introspectionClaims('ik_x')).toBeNull();
    });

    it('short-circuits without a DB hit when the credential is not ik_-prefixed', async () => {
      expect(await service.introspectionClaims('some.jwt.token')).toBeNull();
      expect(mockPrisma.apiKey.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('bounds the update to the scoped tenant and 404s on a miss', async () => {
      mockPrisma.apiKey.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.revoke('key-uuid-1', 'co_other')).rejects.toThrow(
        NotFoundException,
      );
      const where = mockPrisma.apiKey.updateMany.mock.calls[0][0].where;
      expect(where.organization).toEqual({ companyId: 'co_other' });
    });

    it('revokes and returns the public row', async () => {
      mockPrisma.apiKey.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.apiKey.findUnique.mockResolvedValue({ ...storedKey, revoked: true });

      const row = await service.revoke('key-uuid-1');
      expect(row.revoked).toBe(true);
      expect(row).not.toHaveProperty('keyHash');
    });
  });
});
