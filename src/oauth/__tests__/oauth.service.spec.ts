import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
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

  describe('issueClientCredentialsToken', () => {
    const m2mClient: Partial<OAuthClient> = {
      id: 'uuid-m2m',
      clientId: 'smart-chat-brain',
      clientSecretHash: '$2a$10$x',
      name: 'Smart Chat Brain',
      redirectUris: [],
      allowedScopes: ['brain:read', 'brain:write', 'brain:admin'],
      allowedGrants: ['client_credentials'],
      companyId: 'co_smar_chat',
      active: true,
    };

    it('issues a token signed with sub=companyId when set', async () => {
      const signSpy = jest.fn().mockReturnValue('m2m-jwt');
      const jwt = (service as any).jwtService;
      jwt.sign = signSpy;

      const result = await service.issueClientCredentialsToken(
        m2mClient as OAuthClient,
        'brain:read brain:write brain:admin',
        'brain',
      );

      expect(result.accessToken).toBe('m2m-jwt');
      expect(result.scope).toBe('brain:read brain:write brain:admin');
      const [payload, opts] = signSpy.mock.calls[0];
      expect(payload.sub).toBe('co_smar_chat');
      expect(payload.scopes).toEqual([
        'brain:read',
        'brain:write',
        'brain:admin',
      ]);
      expect(opts.audience).toBe('brain');
    });

    it('falls back to clientId as sub when companyId is unset', async () => {
      const signSpy = jest.fn().mockReturnValue('m2m-jwt');
      (service as any).jwtService.sign = signSpy;

      await service.issueClientCredentialsToken(
        { ...m2mClient, companyId: null } as OAuthClient,
        'brain:read',
        undefined,
      );

      const [payload] = signSpy.mock.calls[0];
      expect(payload.sub).toBe('smart-chat-brain');
    });

    it('grants ALL allowed scopes when none are explicitly requested', async () => {
      const signSpy = jest.fn().mockReturnValue('m2m-jwt');
      (service as any).jwtService.sign = signSpy;

      const result = await service.issueClientCredentialsToken(
        m2mClient as OAuthClient,
        undefined,
        'brain',
      );

      expect(result.scope).toBe('brain:read brain:write brain:admin');
    });

    it('rejects when the requested scope is not in allowedScopes', async () => {
      await expect(
        service.issueClientCredentialsToken(
          m2mClient as OAuthClient,
          'brain:admin admin',
          'brain',
        ),
      ).rejects.toThrow(/not allowed/);
    });

    it('rejects when the client has no scopes at all', async () => {
      await expect(
        service.issueClientCredentialsToken(
          { ...m2mClient, allowedScopes: [] } as OAuthClient,
          undefined,
          'brain',
        ),
      ).rejects.toThrow(/No scopes available/);
    });

    describe('audience binding', () => {
      it('rejects audience not in allowedAudiences', async () => {
        const signSpy = jest.fn().mockReturnValue('jwt');
        (service as any).jwtService.sign = signSpy;
        await expect(
          service.issueClientCredentialsToken(
            { ...m2mClient, allowedAudiences: ['brain'] } as OAuthClient,
            undefined,
            'admin-panel',
          ),
        ).rejects.toThrow(/Audience "admin-panel" is not allowed/);
        expect(signSpy).not.toHaveBeenCalled();
      });

      it('accepts audience present in allowedAudiences', async () => {
        const signSpy = jest.fn().mockReturnValue('jwt');
        (service as any).jwtService.sign = signSpy;
        const result = await service.issueClientCredentialsToken(
          { ...m2mClient, allowedAudiences: ['brain', 'inbox'] } as OAuthClient,
          undefined,
          'inbox',
        );
        expect(result.audience).toBe('inbox');
        const [, opts] = signSpy.mock.calls[0];
        expect(opts.audience).toBe('inbox');
      });

      it('defaults to first allowedAudience when none requested', async () => {
        const signSpy = jest.fn().mockReturnValue('jwt');
        (service as any).jwtService.sign = signSpy;
        const result = await service.issueClientCredentialsToken(
          { ...m2mClient, allowedAudiences: ['brain', 'inbox'] } as OAuthClient,
          undefined,
          undefined,
        );
        expect(result.audience).toBe('brain');
      });

      it('falls back to clientId as audience when allowList empty and none requested', async () => {
        const signSpy = jest.fn().mockReturnValue('jwt');
        (service as any).jwtService.sign = signSpy;
        const result = await service.issueClientCredentialsToken(
          { ...m2mClient, allowedAudiences: [] } as OAuthClient,
          undefined,
          undefined,
        );
        expect(result.audience).toBe('smart-chat-brain');
      });
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
            nonce: null,
          }),
        }),
      );
    });

    it('persists nonce when provided (OIDC core §3.1.2.1)', async () => {
      mockPrisma.authorizationCode.create.mockResolvedValue({ code: 'test-code' });

      await service.createAuthorizationCode(
        'user-1', 'test-app', 'https://app.example.com/callback',
        'openid profile', 'challenge', 'S256', 'n-0S6_WzA2Mj',
      );

      expect(mockPrisma.authorizationCode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nonce: 'n-0S6_WzA2Mj' }),
        }),
      );
    });
  });

  describe('nonce in id_token', () => {
    const setHmacSecret = () => {
      (service as any).configService.get = jest.fn((key: string) => {
        if (key === 'REFRESH_TOKEN_HMAC_SECRET') return 'test-secret';
        if (key === 'JWT_SECRET') return 'test-secret';
        return '';
      });
    };

    it('embeds nonce in id_token claims when present on the auth code', async () => {
      const signSpy = jest.fn().mockReturnValue('jwt');
      (service as any).jwtService.sign = signSpy;
      mockPrisma.refreshToken.create.mockResolvedValue({});
      setHmacSecret();

      const user = { id: 'u', did: 'did:k:1', email: 'e', emailVerified: true, name: 'N', avatarUrl: null, metadata: null } as any;
      await (service as any).generateTokens(user, 'test-app', 'openid', undefined, 'nonce-value');

      // First sign call = access_token (no nonce). Second = id_token (with nonce).
      const accessClaims = signSpy.mock.calls[0][0];
      const idClaims = signSpy.mock.calls[1][0];
      expect(accessClaims.nonce).toBeUndefined();
      expect(idClaims.nonce).toBe('nonce-value');
    });

    it('omits nonce from id_token when not provided (back-compat)', async () => {
      const signSpy = jest.fn().mockReturnValue('jwt');
      (service as any).jwtService.sign = signSpy;
      mockPrisma.refreshToken.create.mockResolvedValue({});
      setHmacSecret();

      const user = { id: 'u', did: 'did:k:1', email: 'e', emailVerified: true, name: 'N', avatarUrl: null, metadata: null } as any;
      await (service as any).generateTokens(user, 'test-app', 'openid');

      const idClaims = signSpy.mock.calls[1][0];
      expect('nonce' in idClaims).toBe(false);
    });
  });

  describe('grace-period client secret', () => {
    const buildClient = async (currentSecret: string, previousSecret?: string, previousExpiresAt?: Date | null) => {
      const clientSecretHash = await bcrypt.hash(currentSecret, 4);
      const previousSecretHash = previousSecret ? await bcrypt.hash(previousSecret, 4) : null;
      return {
        ...mockClient,
        clientSecretHash,
        previousSecretHash,
        previousSecretExpiresAt: previousExpiresAt ?? null,
      };
    };

    it('accepts the current secret', async () => {
      mockPrisma.oAuthClient.findFirst.mockResolvedValue(
        await buildClient('current-secret'),
      );
      const result = await service.validateClient('test-app', 'current-secret');
      expect(result.clientId).toBe('test-app');
    });

    it('accepts the previous secret during the grace window', async () => {
      const future = new Date(Date.now() + 60_000);
      mockPrisma.oAuthClient.findFirst.mockResolvedValue(
        await buildClient('current-secret', 'old-secret', future),
      );

      const result = await service.validateClient('test-app', 'old-secret');
      expect(result.clientId).toBe('test-app');
    });

    it('rejects the previous secret once the grace window expired', async () => {
      const past = new Date(Date.now() - 60_000);
      mockPrisma.oAuthClient.findFirst.mockResolvedValue(
        await buildClient('current-secret', 'old-secret', past),
      );

      await expect(
        service.validateClient('test-app', 'old-secret'),
      ).rejects.toThrow('Invalid client credentials');
    });

    it('rejects an entirely wrong secret even if a previous slot exists', async () => {
      const future = new Date(Date.now() + 60_000);
      mockPrisma.oAuthClient.findFirst.mockResolvedValue(
        await buildClient('current-secret', 'old-secret', future),
      );

      await expect(
        service.validateClient('test-app', 'random-junk'),
      ).rejects.toThrow('Invalid client credentials');
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
