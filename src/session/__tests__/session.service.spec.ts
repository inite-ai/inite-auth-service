import { Test, TestingModule } from '@nestjs/testing';
import { SessionService } from '../session.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SessionService', () => {
  let service: SessionService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      refreshToken: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  describe('getActiveSessions', () => {
    it('should return only non-expired non-revoked sessions', async () => {
      const future = new Date();
      future.setDate(future.getDate() + 7);

      mockPrisma.refreshToken.findMany.mockResolvedValue([
        { id: '1', client: { name: 'App' }, createdAt: new Date(), expiresAt: future },
      ]);

      const sessions = await service.getActiveSessions('user-1');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].clientName).toBe('App');

      // Should filter by revoked=false and expiresAt > now
      expect(mockPrisma.refreshToken.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            revoked: false,
          }),
        }),
      );
    });
  });

  describe('revokeSession', () => {
    it('should revoke specific session', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.revokeSession('user-1', 's1');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 's1', userId: 'user-1' },
          data: expect.objectContaining({ revoked: true }),
        }),
      );
    });
  });

  describe('revokeAllSessions', () => {
    it('should revoke all sessions for user', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      await service.revokeAllSessions('user-1');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', revoked: false },
          data: expect.objectContaining({ revoked: true }),
        }),
      );
    });
  });
});
