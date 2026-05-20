import { Test, TestingModule } from '@nestjs/testing';
import { OAuthAuditService } from '../oauth-audit.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('OAuthAuditService', () => {
  let service: OAuthAuditService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      oAuthAuditLog: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      oAuthClient: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthAuditService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OAuthAuditService>(OAuthAuditService);
  });

  describe('record() — companyId denormalisation', () => {
    it('persists companyId resolved from the OAuth client', async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue({
        companyId: 'co_acme',
      });

      await service.record({
        event: 'token.issued.client_credentials',
        clientId: 'acme-svc',
        success: true,
      });

      const persisted = mockPrisma.oAuthAuditLog.create.mock.calls[0][0].data;
      expect(persisted.companyId).toBe('co_acme');
      expect(persisted.clientId).toBe('acme-svc');
    });

    it('persists null companyId when caller passed null explicitly', async () => {
      await service.record({
        event: 'X',
        clientId: 'acme-svc',
        companyId: null,
        success: true,
      });

      const persisted = mockPrisma.oAuthAuditLog.create.mock.calls[0][0].data;
      expect(persisted.companyId).toBeNull();
      // Did NOT touch the client table because caller supplied an
      // explicit override.
      expect(mockPrisma.oAuthClient.findUnique).not.toHaveBeenCalled();
    });

    it('persists null companyId when the client row is missing', async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(null);

      await service.record({
        event: 'token.failed.invalid_credentials',
        clientId: 'ghost',
        success: false,
      });

      const persisted = mockPrisma.oAuthAuditLog.create.mock.calls[0][0].data;
      expect(persisted.companyId).toBeNull();
    });

    it('caches companyId per client to avoid hot-path DB load', async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue({
        companyId: 'co_acme',
      });

      await service.record({ event: 'a', clientId: 'acme-svc', success: true });
      await service.record({ event: 'b', clientId: 'acme-svc', success: true });
      await service.record({ event: 'c', clientId: 'acme-svc', success: true });

      // 3 audit writes but only one client lookup thanks to the cache.
      expect(mockPrisma.oAuthClient.findUnique).toHaveBeenCalledTimes(1);
    });

    it('does not throw when DB write fails (fire-and-forget)', async () => {
      mockPrisma.oAuthAuditLog.create.mockRejectedValue(new Error('boom'));

      await expect(
        service.record({ event: 'X', success: true }),
      ).resolves.toBeUndefined();
    });
  });

  describe('list()', () => {
    it('passes companyId straight through to the where clause', async () => {
      await service.list({ companyId: 'co_acme', limit: 10 });

      const where = mockPrisma.oAuthAuditLog.findMany.mock.calls[0][0].where;
      expect(where.companyId).toBe('co_acme');
    });

    it('omits companyId filter when undefined (superadmin path)', async () => {
      await service.list({ limit: 10 });

      const where = mockPrisma.oAuthAuditLog.findMany.mock.calls[0][0].where;
      expect('companyId' in where).toBe(false);
    });

    it('caps limit at 200', async () => {
      await service.list({ limit: 99999 });
      const call = mockPrisma.oAuthAuditLog.findMany.mock.calls[0][0];
      expect(call.take).toBe(200);
    });

    it('builds time-range where clause from since/until', async () => {
      const since = new Date('2026-05-01T00:00:00Z');
      const until = new Date('2026-05-19T00:00:00Z');
      await service.list({ since, until });

      const where = mockPrisma.oAuthAuditLog.findMany.mock.calls[0][0].where;
      expect(where.ts.gte).toBe(since);
      expect(where.ts.lte).toBe(until);
    });
  });
});
