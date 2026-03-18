import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from '../admin.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminService', () => {
  let service: AdminService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      oAuthClient: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      passkey: {
        findMany: jest.fn(),
        count: jest.fn(),
        deleteMany: jest.fn(),
      },
      wallet: {
        findMany: jest.fn(),
        count: jest.fn(),
        deleteMany: jest.fn(),
      },
      refreshToken: {
        count: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
      authorizationCode: {
        count: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
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
      mockPrisma.user.findMany.mockResolvedValue(users);
      mockPrisma.user.count.mockResolvedValue(2);

      const result = await service.getAllUsers(1, 20);
      expect(result.users).toHaveLength(2);
      expect((result.users[0] as any).passwordHash).toBeUndefined();
      expect(result.pagination.total).toBe(2);
    });

    it('should cap limit to 100', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);
      await service.getAllUsers(1, 9999);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('should enforce minimum limit of 1', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);
      await service.getAllUsers(1, -5);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
    });
  });

  describe('updateUserRoles', () => {
    it('should set isAdmin in metadata when admin role present', async () => {
      const user = { id: '1', metadata: {} };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...user, ...data, passwordHash: undefined }),
      );

      await service.updateUserRoles('1', ['admin', 'user']);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: '1' },
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              isAdmin: true,
              roles: ['admin', 'user'],
            }),
          }),
        }),
      );
    });

    it('should set isAdmin false when no admin role', async () => {
      const user = { id: '1', metadata: { isAdmin: true } };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...user, ...data, passwordHash: undefined }),
      );

      await service.updateUserRoles('1', ['user']);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: '1' },
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              isAdmin: false,
              roles: ['user'],
            }),
          }),
        }),
      );
    });
  });

  describe('getAllOAuthClients', () => {
    it('should return clients without clientSecretHash', async () => {
      mockPrisma.oAuthClient.findMany.mockResolvedValue([
        { clientId: 'app', clientSecretHash: 'secret', allowedScopes: ['openid'], allowedGrants: ['authorization_code'], redirectUris: ['https://a.com/callback', 'https://b.com/callback'] },
      ]);

      const result = await service.getAllOAuthClients();
      expect((result[0] as any).clientSecretHash).toBeUndefined();
      expect(result[0].redirectUris).toEqual(['https://a.com/callback', 'https://b.com/callback']);
    });
  });

  describe('deleteOAuthClient', () => {
    it('should delete related data before client', async () => {
      mockPrisma.authorizationCode.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.oAuthClient.delete.mockResolvedValue({});

      await service.deleteOAuthClient('test-app');

      expect(mockPrisma.authorizationCode.deleteMany).toHaveBeenCalledWith({ where: { clientId: 'test-app' } });
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { clientId: 'test-app' } });
      expect(mockPrisma.oAuthClient.delete).toHaveBeenCalledWith({ where: { clientId: 'test-app' } });
    });
  });
});
