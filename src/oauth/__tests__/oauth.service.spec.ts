import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthService } from '../oauth.service';
import { parsePostgresArray } from '../../common/responses';
import { PkceService } from '../pkce.service';
import { IdentityService } from '../../identity/identity.service';
import {
  OAuthClient,
  AuthorizationCode,
  RefreshToken,
  User,
} from '../../database/entities';

describe('OAuthService', () => {
  let service: OAuthService;
  let clientRepo: any;
  let authCodeRepo: any;
  let refreshTokenRepo: any;

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
    clientRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    authCodeRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    refreshTokenRepo = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthService,
        { provide: getRepositoryToken(OAuthClient), useValue: clientRepo },
        { provide: getRepositoryToken(AuthorizationCode), useValue: authCodeRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokenRepo },
        { provide: getRepositoryToken(User), useValue: {} },
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
      clientRepo.findOne.mockResolvedValue(mockClient);
      const result = await service.validateClient('test-app');
      expect(result.clientId).toBe('test-app');
    });

    it('should throw when client not found', async () => {
      clientRepo.findOne.mockResolvedValue(null);
      await expect(service.validateClient('nonexistent')).rejects.toThrow('Invalid client');
    });

    it('should throw when client_secret is wrong', async () => {
      clientRepo.findOne.mockResolvedValue(mockClient);
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
      authCodeRepo.create.mockReturnValue({ code: 'test-code' });
      authCodeRepo.save.mockResolvedValue({ code: 'test-code' });

      const code = await service.createAuthorizationCode(
        'user-1', 'test-app', 'https://app.example.com/callback',
        'openid profile', 'challenge', 'S256',
      );

      expect(code).toBeTruthy();
      expect(authCodeRepo.create).toHaveBeenCalled();
      expect(authCodeRepo.save).toHaveBeenCalled();
    });
  });

  describe('parsePostgresArray', () => {
    it('should handle array input', () => {
      const result = parsePostgresArray(['https://a.com', 'https://b.com']);
      expect(result).toEqual(['https://a.com', 'https://b.com']);
    });

    it('should handle Postgres string format', () => {
      const result = parsePostgresArray('{https://a.com,https://b.com}');
      expect(result).toEqual(['https://a.com', 'https://b.com']);
    });

    it('should handle empty/null', () => {
      expect(parsePostgresArray(null)).toEqual([]);
      expect(parsePostgresArray(undefined)).toEqual([]);
    });
  });

  describe('getAllowedOrigins', () => {
    it('should collect origins from client redirect URIs', async () => {
      clientRepo.find.mockResolvedValue([
        { redirectUris: ['https://app1.com/callback', 'https://app2.com/callback'] },
        { redirectUris: ['https://app3.com/callback'] },
      ]);

      const origins = await service.getAllowedOrigins();
      expect(origins.has('https://app1.com')).toBe(true);
      expect(origins.has('https://app2.com')).toBe(true);
      expect(origins.has('https://app3.com')).toBe(true);
    });

    it('should handle Postgres string format in redirectUris', async () => {
      clientRepo.find.mockResolvedValue([
        { redirectUris: '{https://app1.com/callback,https://app2.com/cb}' },
      ]);

      const origins = await service.getAllowedOrigins();
      expect(origins.has('https://app1.com')).toBe(true);
      expect(origins.has('https://app2.com')).toBe(true);
    });

    it('should use cache on subsequent calls', async () => {
      clientRepo.find.mockResolvedValue([
        { redirectUris: ['https://app.com/callback'] },
      ]);

      await service.getAllowedOrigins();
      await service.getAllowedOrigins();

      expect(clientRepo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('isAllowedOrigin', () => {
    it('should return true for allowed origin', async () => {
      clientRepo.find.mockResolvedValue([
        { redirectUris: ['https://app.com/callback'] },
      ]);

      expect(await service.isAllowedOrigin('https://app.com')).toBe(true);
    });

    it('should return false for unknown origin', async () => {
      clientRepo.find.mockResolvedValue([
        { redirectUris: ['https://app.com/callback'] },
      ]);

      expect(await service.isAllowedOrigin('https://evil.com')).toBe(false);
    });
  });
});
