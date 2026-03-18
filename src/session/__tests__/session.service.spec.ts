import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SessionService } from '../session.service';
import { RefreshToken } from '../../database/entities';

describe('SessionService', () => {
  let service: SessionService;
  let repo: any;

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: getRepositoryToken(RefreshToken), useValue: repo },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  describe('getActiveSessions', () => {
    it('should return only non-expired non-revoked sessions', async () => {
      const future = new Date();
      future.setDate(future.getDate() + 7);

      repo.find.mockResolvedValue([
        { id: '1', client: { name: 'App' }, createdAt: new Date(), expiresAt: future },
      ]);

      const sessions = await service.getActiveSessions('user-1');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].clientName).toBe('App');

      // Should filter by revoked=false and expiresAt > now
      expect(repo.find).toHaveBeenCalledWith(
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
      const token = { id: 's1', userId: 'user-1', revoked: false };
      repo.findOne.mockResolvedValue(token);
      repo.save.mockResolvedValue({});

      await service.revokeSession('user-1', 's1');

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ revoked: true }),
      );
    });

    it('should do nothing if session not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await service.revokeSession('user-1', 'nonexistent');
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllSessions', () => {
    it('should revoke all sessions for user', async () => {
      repo.update.mockResolvedValue({});

      await service.revokeAllSessions('user-1');

      expect(repo.update).toHaveBeenCalledWith(
        { userId: 'user-1', revoked: false },
        expect.objectContaining({ revoked: true }),
      );
    });
  });
});
