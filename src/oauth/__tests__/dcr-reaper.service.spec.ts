import { Test, TestingModule } from '@nestjs/testing';
import { DcrReaperService } from '../dcr-reaper.service';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY_MS);

describe('DcrReaperService', () => {
  let service: DcrReaperService;
  let mockPrisma: {
    oAuthClient: { findMany: jest.Mock; deleteMany: jest.Mock };
    refreshToken: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      oAuthClient: {
        findMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      refreshToken: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DcrReaperService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DcrReaperService>(DcrReaperService);
  });

  it('deletes a stale dcr_ client with no refresh tokens', async () => {
    mockPrisma.oAuthClient.findMany.mockResolvedValue([
      { id: 'uuid-stale', clientId: 'dcr_abc' },
    ]);
    mockPrisma.refreshToken.findMany.mockResolvedValue([]);

    await service.reapStaleClients();

    expect(mockPrisma.oAuthClient.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['uuid-stale'] } },
    });
  });

  it('keeps a stale dcr_ client that has a refresh token', async () => {
    mockPrisma.oAuthClient.findMany.mockResolvedValue([
      { id: 'uuid-used', clientId: 'dcr_used' },
    ]);
    mockPrisma.refreshToken.findMany.mockResolvedValue([{ clientId: 'dcr_used' }]);

    await service.reapStaleClients();

    expect(mockPrisma.oAuthClient.deleteMany).not.toHaveBeenCalled();
  });

  it('only selects dcr_ clients older than the cutoff', async () => {
    mockPrisma.oAuthClient.findMany.mockResolvedValue([]);

    await service.reapStaleClients();

    const where = mockPrisma.oAuthClient.findMany.mock.calls[0][0].where;
    expect(where.clientId).toEqual({ startsWith: 'dcr_' });
    expect(where.createdAt.lt).toBeInstanceOf(Date);
    // cutoff is ~30 days in the past, so a client created 10 days ago is excluded.
    expect(where.createdAt.lt.getTime()).toBeLessThan(daysAgo(29).getTime());
    expect(where.createdAt.lt.getTime()).toBeGreaterThan(daysAgo(31).getTime());
  });

  it('does not call deleteMany when there is nothing to delete', async () => {
    mockPrisma.oAuthClient.findMany.mockResolvedValue([]);

    await service.reapStaleClients();

    expect(mockPrisma.refreshToken.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.oAuthClient.deleteMany).not.toHaveBeenCalled();
  });
});
