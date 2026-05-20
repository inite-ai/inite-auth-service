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

  describe('createOAuthClient', () => {
    it('persists allowedGrants + companyId when provided', async () => {
      mockPrisma.oAuthClient.create.mockImplementation(({ data }: any) => ({
        ...data,
        id: 'uuid-1',
        clientSecretHash: data.clientSecretHash,
      }));

      const result = await service.createOAuthClient({
        name: 'Brain M2M',
        clientId: 'smart-chat-brain',
        redirectUris: [],
        allowedScopes: ['brain:read', 'brain:write', 'brain:admin'],
        allowedGrants: ['client_credentials'],
        companyId: 'co_smar_chat',
      });

      const persisted = mockPrisma.oAuthClient.create.mock.calls[0][0].data;
      expect(persisted.allowedScopes).toEqual([
        'brain:read', 'brain:write', 'brain:admin',
      ]);
      expect(persisted.allowedGrants).toEqual(['client_credentials']);
      expect(persisted.companyId).toBe('co_smar_chat');
      expect(result.clientSecret).toBeDefined();
      expect(result.clientSecret.length).toBeGreaterThan(20);
    });

    it('falls back to default scopes when none provided', async () => {
      mockPrisma.oAuthClient.create.mockImplementation(({ data }: any) => data);

      await service.createOAuthClient({
        name: 'User App',
        clientId: 'user-app',
        redirectUris: ['https://app.test/callback'],
      });

      const persisted = mockPrisma.oAuthClient.create.mock.calls[0][0].data;
      expect(persisted.allowedScopes).toEqual(['openid', 'profile', 'email']);
      // allowedGrants is omitted from the prisma payload — the schema
      // default ['authorization_code', 'refresh_token'] applies.
      expect(persisted.allowedGrants).toBeUndefined();
      expect(persisted.companyId).toBeNull();
    });

    it('treats empty allowedGrants array as "use schema default"', async () => {
      mockPrisma.oAuthClient.create.mockImplementation(({ data }: any) => data);

      await service.createOAuthClient({
        name: 'X',
        clientId: 'x',
        redirectUris: [],
        allowedGrants: [],
      });

      const persisted = mockPrisma.oAuthClient.create.mock.calls[0][0].data;
      expect(persisted.allowedGrants).toBeUndefined();
    });

    it('persists allowedAudiences for M2M clients', async () => {
      mockPrisma.oAuthClient.create.mockImplementation(({ data }: any) => data);

      await service.createOAuthClient({
        name: 'Brain M2M',
        clientId: 'smart-chat-brain',
        redirectUris: [],
        allowedGrants: ['client_credentials'],
        allowedScopes: ['brain:read'],
        allowedAudiences: ['brain'],
        companyId: 'co_smar_chat',
      });

      const persisted = mockPrisma.oAuthClient.create.mock.calls[0][0].data;
      expect(persisted.allowedAudiences).toEqual(['brain']);
    });

    it('defaults allowedAudiences to empty array when not provided', async () => {
      mockPrisma.oAuthClient.create.mockImplementation(({ data }: any) => data);

      await service.createOAuthClient({
        name: 'User App',
        clientId: 'user-app',
        redirectUris: ['https://app.test/callback'],
      });

      const persisted = mockPrisma.oAuthClient.create.mock.calls[0][0].data;
      expect(persisted.allowedAudiences).toEqual([]);
    });
  });

  describe('updateOAuthClient', () => {
    it('passes allowedGrants and companyId through to prisma', async () => {
      mockPrisma.oAuthClient.update.mockResolvedValue({
        clientId: 'smart-chat-brain',
        clientSecretHash: 'hash',
        allowedGrants: ['client_credentials'],
        companyId: 'co_smar_chat',
      });

      await service.updateOAuthClient('smart-chat-brain', {
        allowedGrants: ['client_credentials'],
        companyId: 'co_smar_chat',
      });

      const calledData = mockPrisma.oAuthClient.update.mock.calls[0][0].data;
      expect(calledData.allowedGrants).toEqual(['client_credentials']);
      expect(calledData.companyId).toBe('co_smar_chat');
    });

    it('returns null when the client does not exist', async () => {
      mockPrisma.oAuthClient.update.mockRejectedValue(new Error('not found'));
      const result = await service.updateOAuthClient('ghost', { name: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('rotateClientSecret', () => {
    const existingClient = {
      clientId: 'test-app',
      clientSecretHash: 'old-hash',
      previousSecretHash: null,
      previousSecretExpiresAt: null,
    };

    it('moves the current hash to the previous slot with default 24h grace', async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(existingClient);
      mockPrisma.oAuthClient.update.mockResolvedValue({});

      const before = Date.now();
      const result = await service.rotateClientSecret('test-app');
      const after = Date.now();

      const updatePayload = mockPrisma.oAuthClient.update.mock.calls[0][0].data;
      expect(updatePayload.previousSecretHash).toBe('old-hash');
      expect(updatePayload.clientSecretHash).not.toBe('old-hash');
      const expiresMs = updatePayload.previousSecretExpiresAt.getTime();
      expect(expiresMs).toBeGreaterThanOrEqual(before + 24 * 3600 * 1000 - 50);
      expect(expiresMs).toBeLessThanOrEqual(after + 24 * 3600 * 1000 + 50);
      expect(result!.graceWindowSeconds).toBe(24 * 3600);
      expect(result!.clientSecret.length).toBeGreaterThan(20);
    });

    it('clears the previous slot when force=true', async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(existingClient);
      mockPrisma.oAuthClient.update.mockResolvedValue({});

      const result = await service.rotateClientSecret('test-app', { force: true });
      const updatePayload = mockPrisma.oAuthClient.update.mock.calls[0][0].data;
      expect(updatePayload.previousSecretHash).toBeNull();
      expect(updatePayload.previousSecretExpiresAt).toBeNull();
      expect(result!.graceWindowSeconds).toBe(0);
    });

    it('caps the grace window at 7 days', async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(existingClient);
      mockPrisma.oAuthClient.update.mockResolvedValue({});

      const ridiculous = 365 * 24 * 3600;
      const result = await service.rotateClientSecret('test-app', {
        graceWindowSeconds: ridiculous,
      });
      expect(result!.graceWindowSeconds).toBe(7 * 24 * 3600);
    });

    it('returns null when the client does not exist', async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(null);
      const result = await service.rotateClientSecret('ghost');
      expect(result).toBeNull();
    });
  });
});
