import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthService } from '../oauth.service';
import { PkceService } from '../pkce.service';
import { IdentityService } from '../../identity/identity.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuthClient } from '@prisma/client';

describe('OAuthService', () => {
  let service: OAuthService;
  let mockPrisma: any;

  const mockClient: Partial<OAuthClient> = {
    id: 'uuid-1',
    clientId: 'test-app',
    clientSecretHash: '$2a$10$hashedvalue',
    name: 'Test App',
    redirectUris: ['https://app.example.com/callback', 'http://localhost:3000/callback'],
    allowedScopes: ['openid', 'profile', 'email'],
    allowedGrants: ['authorization_code', 'refresh_token'],
    active: true,
  };

  beforeEach(async () => {
    mockPrisma = {
      oAuthClient: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      authorizationCode: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      refreshToken: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('jwt-token') } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
        { provide: PkceService, useValue: { verifyCodeChallenge: jest.fn() } },
        { provide: IdentityService, useValue: { getWallets: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    service = module.get<OAuthService>(OAuthService);
  });

  describe('validateClient', () => {
    it('should return client when valid clientId', async () => {
      mockPrisma.oAuthClient.findFirst.mockResolvedValue(mockClient);
      const result = await service.validateClient('test-app');
      expect(result.clientId).toBe('test-app');
    });

    it('should throw when client not found', async () => {
      mockPrisma.oAuthClient.findFirst.mockResolvedValue(null);
      await expect(service.validateClient('nonexistent')).rejects.toThrow('Invalid client');
    });

    it('should throw when client_secret is wrong', async () => {
      mockPrisma.oAuthClient.findFirst.mockResolvedValue(mockClient);
      await expect(service.validateClient('test-app', 'wrong-secret')).rejects.toThrow();
    });
  });

  describe('validateClientWithSecret', () => {
    it('should throw when no secret provided', async () => {
      await expect(service.validateClientWithSecret('test-app', '')).rejects.toThrow(
        'client_secret is required',
      );
    });
  });

  describe('validateRedirectUri', () => {
    it('should return true for registered URI', () => {
      expect(service.validateRedirectUri(mockClient as OAuthClient, 'https://app.example.com/callback')).toBe(true);
    });

    it('should return false for unregistered URI', () => {
      expect(service.validateRedirectUri(mockClient as OAuthClient, 'https://evil.com/callback')).toBe(false);
    });
  });

  describe('validateGrantType', () => {
    it('should not throw for allowed grant type', () => {
      expect(() => service.validateGrantType(mockClient as OAuthClient, 'authorization_code')).not.toThrow();
    });

    it('should throw for disallowed grant type', () => {
      expect(() => service.validateGrantType(mockClient as OAuthClient, 'client_credentials')).toThrow(
        'not allowed',
      );
    });
  });

  describe('normalizeScope', () => {
    it('should return requested scopes as-is', () => {
      expect(service.normalizeScope('openid profile')).toBe('openid profile');
    });

    it('should default to openid profile email when empty', () => {
      expect(service.normalizeScope('')).toBe('openid profile email');
    });
  });

  describe('createAuthorizationCode', () => {
    it('should create and save authorization code', async () => {
      mockPrisma.authorizationCode.create.mockResolvedValue({ code: 'test-code' });

      const code = await service.createAuthorizationCode(
        'user-1', 'test-app', 'https://app.example.com/callback',
        'openid profile', 'challenge', 'S256',
      );

      expect(code).toBeTruthy();
      expect(mockPrisma.authorizationCode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            clientId: 'test-app',
            redirectUri: 'https://app.example.com/callback',
            scope: 'openid profile',
            codeChallenge: 'challenge',
            codeChallengeMethod: 'S256',
          }),
        }),
      );
    });
  });

  describe('getAllowedOrigins', () => {
    it('should collect origins from client redirect URIs', async () => {
      mockPrisma.oAuthClient.findMany.mockResolvedValue([
        { redirectUris: ['https://app1.com/callback', 'https://app2.com/callback'] },
        { redirectUris: ['https://app3.com/callback'] },
      ]);

      const origins = await service.getAllowedOrigins();
      expect(origins.has('https://app1.com')).toBe(true);
      expect(origins.has('https://app2.com')).toBe(true);
      expect(origins.has('https://app3.com')).toBe(true);
    });

    it('should use cache on subsequent calls', async () => {
      mockPrisma.oAuthClient.findMany.mockResolvedValue([
        { redirectUris: ['https://app.com/callback'] },
      ]);

      await service.getAllowedOrigins();
      await service.getAllowedOrigins();

      expect(mockPrisma.oAuthClient.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('isAllowedOrigin', () => {
    it('should return true for allowed origin', async () => {
      mockPrisma.oAuthClient.findMany.mockResolvedValue([
        { redirectUris: ['https://app.com/callback'] },
      ]);

      expect(await service.isAllowedOrigin('https://app.com')).toBe(true);
    });

    it('should return false for unknown origin', async () => {
      mockPrisma.oAuthClient.findMany.mockResolvedValue([
        { redirectUris: ['https://app.com/callback'] },
      ]);

      expect(await service.isAllowedOrigin('https://evil.com')).toBe(false);
    });
  });
});
