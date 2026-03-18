import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from '../admin.service';
import {
  User,
  OAuthClient,
  Passkey,
  Wallet,
  RefreshToken,
  AuthorizationCode,
} from '../../database/entities';

describe('AdminService', () => {
  let service: AdminService;
  let userRepo: any;
  let clientRepo: any;
  let refreshTokenRepo: any;
  let authCodeRepo: any;

  beforeEach(async () => {
    userRepo = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    };
    clientRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    };
    refreshTokenRepo = {
      count: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    };
    authCodeRepo = {
      count: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(OAuthClient), useValue: clientRepo },
        { provide: getRepositoryToken(Passkey), useValue: { find: jest.fn(), delete: jest.fn() } },
        { provide: getRepositoryToken(Wallet), useValue: { find: jest.fn(), delete: jest.fn() } },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokenRepo },
        { provide: getRepositoryToken(AuthorizationCode), useValue: authCodeRepo },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('getAllUsers', () => {
    it('should return paginated users without passwordHash', async () => {
      const users = [
        { id: '1', email: 'a@b.com', passwordHash: 'secret' },
        { id: '2', email: 'c@d.com', passwordHash: 'secret2' },
      ];
      userRepo.findAndCount.mockResolvedValue([users, 2]);

      const result = await service.getAllUsers(1, 20);
      expect(result.users).toHaveLength(2);
      expect(result.users[0].passwordHash).toBeUndefined();
      expect(result.pagination.total).toBe(2);
    });

    it('should cap limit to 100', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.getAllUsers(1, 9999);
      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('should enforce minimum limit of 1', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.getAllUsers(1, -5);
      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
    });
  });

  describe('updateUserRoles', () => {
    it('should set isAdmin in metadata when admin role present', async () => {
      const user = { id: '1', metadata: {} };
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockResolvedValue(user);

      await service.updateUserRoles('1', ['admin', 'user']);
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            isAdmin: true,
            roles: ['admin', 'user'],
          }),
        }),
      );
    });

    it('should set isAdmin false when no admin role', async () => {
      const user = { id: '1', metadata: { isAdmin: true } };
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockResolvedValue(user);

      await service.updateUserRoles('1', ['user']);
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            isAdmin: false,
            roles: ['user'],
          }),
        }),
      );
    });
  });

  describe('getAllOAuthClients', () => {
    it('should normalize array fields', async () => {
      clientRepo.find.mockResolvedValue([
        { clientId: 'app', allowedScopes: null, allowedGrants: undefined, redirectUris: '{https://a.com,https://b.com}' },
      ]);

      const result = await service.getAllOAuthClients();
      expect(result[0].allowedScopes).toEqual([]);
      expect(result[0].allowedGrants).toEqual([]);
      expect(result[0].redirectUris).toEqual(['https://a.com', 'https://b.com']);
    });
  });

  describe('deleteOAuthClient', () => {
    it('should delete related data before client', async () => {
      authCodeRepo.delete.mockResolvedValue({});
      refreshTokenRepo.delete.mockResolvedValue({});
      clientRepo.delete.mockResolvedValue({});

      await service.deleteOAuthClient('test-app');

      expect(authCodeRepo.delete).toHaveBeenCalledWith({ clientId: 'test-app' });
      expect(refreshTokenRepo.delete).toHaveBeenCalledWith({ clientId: 'test-app' });
      expect(clientRepo.delete).toHaveBeenCalledWith({ clientId: 'test-app' });
    });
  });
});
