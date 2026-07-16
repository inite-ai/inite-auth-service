import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { OAuthService } from '../oauth.service';
import { OAuthClientRegistryService } from '../oauth-client-registry.service';
import { OAuthTokenIssuerService } from '../oauth-token-issuer.service';
import { OAuthM2mService } from '../oauth-m2m.service';
import { AuthorizationDetailsService } from '../authorization-details.service';
import { SettingsService } from '../../common/settings/settings.service';
import { fakeSettings } from '../../common/settings/settings.test-fixture';
import { OAuthOriginsService } from '../oauth-origins.service';
import { PkceService } from '../pkce.service';
import { IdentityService } from '../../identity/identity.service';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwksService } from '../../common/jwks.service';
import { OAuthClient, User } from '@prisma/client';

describe('OAuthService', () => {
  let service: OAuthService;
  let clientRegistry: OAuthClientRegistryService;
  let tokenIssuer: OAuthTokenIssuerService;
  let m2m: OAuthM2mService;
  let origins: OAuthOriginsService;
  let jwt: { sign: jest.Mock; verify: jest.Mock };
  let config: { get: jest.Mock };
  let mockPrisma: {
    oAuthClient: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    authorizationCode: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    refreshToken: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    user: { findUnique: jest.Mock };
  };

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
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      refreshToken: {
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
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
        OAuthClientRegistryService,
        OAuthTokenIssuerService,
        OAuthM2mService,
        OAuthOriginsService,
        AuthorizationDetailsService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('jwt-token'), verify: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
        { provide: SettingsService, useValue: fakeSettings({}) },
        { provide: JwksService, useValue: { isRs256Enabled: () => false, verificationKeyForToken: jest.fn() } },
        { provide: PkceService, useValue: { verifyCodeChallenge: jest.fn() } },
        { provide: IdentityService, useValue: { getWallets: jest.fn().mockResolvedValue([]) } },
        {
          provide: EmailService,
          useValue: { sendOAuthConsentGranted: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    service = module.get<OAuthService>(OAuthService);
    clientRegistry = module.get<OAuthClientRegistryService>(OAuthClientRegistryService);
    tokenIssuer = module.get<OAuthTokenIssuerService>(OAuthTokenIssuerService);
    m2m = module.get<OAuthM2mService>(OAuthM2mService);
    origins = module.get<OAuthOriginsService>(OAuthOriginsService);
    jwt = module.get<JwtService>(JwtService) as unknown as {
      sign: jest.Mock;
      verify: jest.Mock;
    };
    config = module.get<ConfigService>(ConfigService) as unknown as {
      get: jest.Mock;
    };
  });

  describe('validateClient', () => {
    it('should return client when valid clientId', async () => {
      mockPrisma.oAuthClient.findFirst.mockResolvedValue(mockClient);
      const result = await clientRegistry.validateClient('test-app');
      expect(result.clientId).toBe('test-app');
    });

    it('should throw when client not found', async () => {
      mockPrisma.oAuthClient.findFirst.mockResolvedValue(null);
      await expect(clientRegistry.validateClient('nonexistent')).rejects.toThrow('Invalid client');
    });

    it('should throw when client_secret is wrong', async () => {
      mockPrisma.oAuthClient.findFirst.mockResolvedValue(mockClient);
      await expect(clientRegistry.validateClient('test-app', 'wrong-secret')).rejects.toThrow();
    });
  });

  describe('validateClientWithSecret', () => {
    it('should throw when no secret provided for confidential client', async () => {
      mockPrisma.oAuthClient.findFirst.mockResolvedValue({
        ...mockClient,
        isPublic: false,
      } as unknown as OAuthClient);
      await expect(clientRegistry.validateClientWithSecret('test-app', '')).rejects.toThrow(
        'client_secret is required',
      );
    });

    it('should allow missing secret for public clients (PKCE)', async () => {
      mockPrisma.oAuthClient.findFirst.mockResolvedValue({
        ...mockClient,
        isPublic: true,
      } as unknown as OAuthClient);
      const result = await clientRegistry.validateClientWithSecret('test-app', '');
      expect(result).toBeDefined();
      expect(result.isPublic).toBe(true);
    });
  });

  describe('validateRedirectUri', () => {
    it('should return true for registered URI', () => {
      expect(clientRegistry.validateRedirectUri(mockClient as OAuthClient, 'https://app.example.com/callback')).toBe(true);
    });

    it('should return false for unregistered URI', () => {
      expect(clientRegistry.validateRedirectUri(mockClient as OAuthClient, 'https://evil.com/callback')).toBe(false);
    });

    it('should ignore port for loopback redirects when 127.0.0.1 registered', () => {
      const cli: Partial<OAuthClient> = {
        redirectUris: ['http://127.0.0.1/callback'],
      };
      expect(
        clientRegistry.validateRedirectUri(cli as OAuthClient, 'http://127.0.0.1:54321/callback'),
      ).toBe(true);
      expect(
        clientRegistry.validateRedirectUri(cli as OAuthClient, 'http://127.0.0.1:1/callback'),
      ).toBe(true);
    });

    it('should also allow localhost for ::1/localhost when registered', () => {
      const cli: Partial<OAuthClient> = {
        redirectUris: ['http://localhost/callback'],
      };
      expect(
        clientRegistry.validateRedirectUri(cli as OAuthClient, 'http://localhost:9999/callback'),
      ).toBe(true);
    });

    it('should NOT allow port-ignore for non-loopback hosts', () => {
      const cli: Partial<OAuthClient> = {
        redirectUris: ['https://app.example.com/callback'],
      };
      expect(
        clientRegistry.validateRedirectUri(cli as OAuthClient, 'https://app.example.com:8443/callback'),
      ).toBe(false);
    });

    it('should require matching pathname even for loopback', () => {
      const cli: Partial<OAuthClient> = {
        redirectUris: ['http://127.0.0.1/callback'],
      };
      expect(
        clientRegistry.validateRedirectUri(cli as OAuthClient, 'http://127.0.0.1:1234/other'),
      ).toBe(false);
    });

    it('should require matching scheme (no http→https crosstalk)', () => {
      const cli: Partial<OAuthClient> = {
        redirectUris: ['http://127.0.0.1/callback'],
      };
      expect(
        clientRegistry.validateRedirectUri(cli as OAuthClient, 'https://127.0.0.1:1234/callback'),
      ).toBe(false);
    });
  });

  describe('validateGrantType', () => {
    it('should not throw for allowed grant type', () => {
      expect(() => clientRegistry.validateGrantType(mockClient as OAuthClient, 'authorization_code')).not.toThrow();
    });

    it('should throw for disallowed grant type', () => {
      expect(() => clientRegistry.validateGrantType(mockClient as OAuthClient, 'client_credentials')).toThrow(
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
      jwt.sign = signSpy;

      const result = await m2m.issueClientCredentialsToken({
        client: m2mClient as OAuthClient,
        requestedScope: 'brain:read brain:write brain:admin',
        audience: 'brain',
      });

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
      jwt.sign = signSpy;

      await m2m.issueClientCredentialsToken({
        client: { ...m2mClient, companyId: null } as OAuthClient,
        requestedScope: 'brain:read',
        audience: undefined,
      });

      const [payload] = signSpy.mock.calls[0];
      expect(payload.sub).toBe('smart-chat-brain');
    });

    it('grants ALL allowed scopes when none are explicitly requested', async () => {
      const signSpy = jest.fn().mockReturnValue('m2m-jwt');
      jwt.sign = signSpy;

      const result = await m2m.issueClientCredentialsToken({
        client: m2mClient as OAuthClient,
        requestedScope: undefined,
        audience: 'brain',
      });

      expect(result.scope).toBe('brain:read brain:write brain:admin');
    });

    it('rejects when the requested scope is not in allowedScopes', async () => {
      await expect(
        m2m.issueClientCredentialsToken({
          client: m2mClient as OAuthClient,
          requestedScope: 'brain:admin admin',
          audience: 'brain',
        }),
      ).rejects.toThrow(/not allowed/);
    });

    it('rejects when the client has no scopes at all', async () => {
      await expect(
        m2m.issueClientCredentialsToken({
          client: { ...m2mClient, allowedScopes: [] } as OAuthClient,
          requestedScope: undefined,
          audience: 'brain',
        }),
      ).rejects.toThrow(/No scopes available/);
    });

    describe('audience binding', () => {
      it('rejects audience not in allowedAudiences', async () => {
        const signSpy = jest.fn().mockReturnValue('jwt');
        jwt.sign = signSpy;
        await expect(
          m2m.issueClientCredentialsToken({
            client: { ...m2mClient, allowedAudiences: ['brain'] } as OAuthClient,
            requestedScope: undefined,
            audience: 'admin-panel',
          }),
        ).rejects.toThrow(/Audience "admin-panel" is not allowed/);
        expect(signSpy).not.toHaveBeenCalled();
      });

      it('accepts audience present in allowedAudiences', async () => {
        const signSpy = jest.fn().mockReturnValue('jwt');
        jwt.sign = signSpy;
        const result = await m2m.issueClientCredentialsToken({
          client: { ...m2mClient, allowedAudiences: ['brain', 'inbox'] } as OAuthClient,
          requestedScope: undefined,
          audience: 'inbox',
        });
        expect(result.audience).toBe('inbox');
        const [, opts] = signSpy.mock.calls[0];
        expect(opts.audience).toBe('inbox');
      });

      it('defaults to first allowedAudience when none requested', async () => {
        const signSpy = jest.fn().mockReturnValue('jwt');
        jwt.sign = signSpy;
        const result = await m2m.issueClientCredentialsToken({
          client: { ...m2mClient, allowedAudiences: ['brain', 'inbox'] } as OAuthClient,
          requestedScope: undefined,
          audience: undefined,
        });
        expect(result.audience).toBe('brain');
      });

      it('falls back to clientId as audience when allowList empty and none requested', async () => {
        const signSpy = jest.fn().mockReturnValue('jwt');
        jwt.sign = signSpy;
        const result = await m2m.issueClientCredentialsToken({
          client: { ...m2mClient, allowedAudiences: [] } as OAuthClient,
          requestedScope: undefined,
          audience: undefined,
        });
        expect(result.audience).toBe('smart-chat-brain');
      });
    });
  });

  describe('exchangeToken', () => {
    const SUBJECT_TYPE = 'urn:ietf:params:oauth:token-type:access_token';
    const exchangeClient: Partial<OAuthClient> = {
      id: 'uuid-landing',
      clientId: 'brain-landing',
      clientSecretHash: '$2a$10$x',
      name: 'Brain Landing',
      redirectUris: [],
      allowedScopes: ['openid', 'profile', 'email', 'brain:read', 'brain:write'],
      allowedGrants: ['urn:ietf:params:oauth:grant-type:token-exchange'],
      allowedAudiences: ['brain', 'brain-landing'],
      active: true,
    };

    it('carries org/org_id/roles from the subject token so the resource keeps tenant context', async () => {
      jwt.verify.mockReturnValue({
        sub: 'did:key:z6MkUser',
        org: 'co_acme',
        org_id: 'org-uuid-1',
        roles: ['user', 'admin'],
        scope: 'openid brain:read brain:write',
      });
      const signSpy = jest.fn().mockReturnValue('exchanged-jwt');
      jwt.sign = signSpy;

      const result = await m2m.exchangeToken({
        client: exchangeClient as OAuthClient,
        subjectToken: 'subject-jwt',
        subjectTokenType: SUBJECT_TYPE,
        requestedScope: 'brain:read brain:write',
        audience: 'brain',
      } as never);

      expect(result.accessToken).toBe('exchanged-jwt');
      const [payload, opts] = signSpy.mock.calls[0];
      expect(payload.sub).toBe('did:key:z6MkUser');
      expect(payload.org).toBe('co_acme');
      expect(payload.org_id).toBe('org-uuid-1');
      expect(payload.roles).toEqual(['user', 'admin']);
      expect(payload.act).toEqual({ sub: 'brain-landing' });
      expect(opts.audience).toBe('brain');
    });

    it('omits identity claims the subject token does not carry (M2M subject)', async () => {
      jwt.verify.mockReturnValue({
        sub: 'co_acme',
        scope: 'brain:read',
      });
      const signSpy = jest.fn().mockReturnValue('exchanged-jwt');
      jwt.sign = signSpy;

      await m2m.exchangeToken({
        client: exchangeClient as OAuthClient,
        subjectToken: 'subject-jwt',
        subjectTokenType: SUBJECT_TYPE,
        audience: 'brain',
      } as never);

      const [payload] = signSpy.mock.calls[0];
      expect(payload).not.toHaveProperty('org');
      expect(payload).not.toHaveProperty('org_id');
      expect(payload).not.toHaveProperty('roles');
    });

    it('carries inite_mcp_resource authorization_details, dropping other types', async () => {
      const mcpGrant = {
        type: 'inite_mcp_resource',
        locations: ['https://brain.inite.ai'],
        actions: ['search_knowledge'],
      };
      jwt.verify.mockReturnValue({
        sub: 'did:key:z6MkUser',
        scope: 'brain:read',
        authorization_details: [
          mcpGrant,
          { type: 'payment_initiation', actions: ['initiate'] },
        ],
      });
      const signSpy = jest.fn().mockReturnValue('exchanged-jwt');
      jwt.sign = signSpy;

      await m2m.exchangeToken({
        client: exchangeClient as OAuthClient,
        subjectToken: 'subject-jwt',
        subjectTokenType: SUBJECT_TYPE,
        audience: 'brain',
      } as never);

      const [payload] = signSpy.mock.calls[0];
      expect(payload.authorization_details).toEqual([mcpGrant]);
    });

    it('omits authorization_details when the subject token carries none', async () => {
      jwt.verify.mockReturnValue({ sub: 'did:key:z6MkUser', scope: 'brain:read' });
      const signSpy = jest.fn().mockReturnValue('exchanged-jwt');
      jwt.sign = signSpy;

      await m2m.exchangeToken({
        client: exchangeClient as OAuthClient,
        subjectToken: 'subject-jwt',
        subjectTokenType: SUBJECT_TYPE,
        audience: 'brain',
      } as never);

      const [payload] = signSpy.mock.calls[0];
      expect(payload).not.toHaveProperty('authorization_details');
    });

    it('rejects a requested scope beyond the subject token authority', async () => {
      jwt.verify.mockReturnValue({
        sub: 'did:key:z6MkUser',
        scope: 'openid brain:read',
      });

      await expect(
        m2m.exchangeToken({
          client: exchangeClient as OAuthClient,
          subjectToken: 'subject-jwt',
          subjectTokenType: SUBJECT_TYPE,
          requestedScope: 'brain:write',
          audience: 'brain',
        } as never),
      ).rejects.toThrow(/exceeds the subject token/);
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

      const code = await service.createAuthorizationCode({
        userId: 'user-1',
        clientId: 'test-app',
        redirectUri: 'https://app.example.com/callback',
        scope: 'openid profile',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
      });

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

      await service.createAuthorizationCode({
        userId: 'user-1',
        clientId: 'test-app',
        redirectUri: 'https://app.example.com/callback',
        scope: 'openid profile',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        nonce: 'n-0S6_WzA2Mj',
      });

      expect(mockPrisma.authorizationCode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nonce: 'n-0S6_WzA2Mj' }),
        }),
      );
    });
  });

  describe('exchangeAuthorizationCode — RFC 8707 resource audience', () => {
    const user = {
      id: 'u', did: 'did:k:1', email: 'e', emailVerified: true,
      name: 'N', avatarUrl: null, metadata: null,
    } as unknown as User;

    const setup = (resource: string | null, allowedAudiences: string[]) => {
      config.get = jest.fn((key: string) => {
        if (key === 'REFRESH_TOKEN_HMAC_SECRET') return 'test-secret';
        if (key === 'JWT_SECRET') return 'test-secret';
        return '';
      });
      mockPrisma.authorizationCode.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.authorizationCode.findUnique.mockResolvedValue({
        code: 'code-1', userId: 'u', clientId: 'test-app',
        redirectUri: 'https://app.example.com/callback',
        scope: 'openid', nonce: null, acrValues: null, amr: [],
        codeChallenge: null, resource, user,
      });
      mockPrisma.oAuthClient.findUnique.mockResolvedValue({
        allowedAudiences, companyId: null,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({});
      const signSpy = jest.fn().mockReturnValue('jwt');
      jwt.sign = signSpy;
      return signSpy;
    };

    const exchange = () =>
      service.exchangeAuthorizationCode({
        code: 'code-1', clientId: 'test-app',
        redirectUri: 'https://app.example.com/callback',
      });

    it('binds the access-token audience to a resource in allowedAudiences', async () => {
      const signSpy = setup('https://api.example.com', ['https://api.example.com']);
      await exchange();
      // First sign call = access_token.
      const [, accessOpts] = signSpy.mock.calls[0];
      expect(accessOpts.audience).toBe('https://api.example.com');
    });

    it('rejects a resource not in a non-empty allowedAudiences', async () => {
      const signSpy = setup('https://evil.example.com', ['https://api.example.com']);
      await expect(exchange()).rejects.toThrow(/Resource ".*" is not allowed/);
      expect(signSpy).not.toHaveBeenCalled();
    });

    it('keeps the audience as clientId when no resource is requested', async () => {
      const signSpy = setup(null, ['https://api.example.com']);
      await exchange();
      const [, accessOpts] = signSpy.mock.calls[0];
      expect(accessOpts.audience).toBe('test-app');
    });

    it('leaves the id_token aud as the clientId even when a resource is set', async () => {
      const signSpy = setup('https://api.example.com', ['https://api.example.com']);
      await exchange();
      // Second sign call = id_token; its aud MUST stay the clientId (OIDC core).
      const [, idOpts] = signSpy.mock.calls[1];
      expect(idOpts.audience).toBe('test-app');
    });
  });

  describe('nonce in id_token', () => {
    const setHmacSecret = () => {
      config.get = jest.fn((key: string) => {
        if (key === 'REFRESH_TOKEN_HMAC_SECRET') return 'test-secret';
        if (key === 'JWT_SECRET') return 'test-secret';
        return '';
      });
    };

    it('embeds nonce in id_token claims when present on the auth code', async () => {
      const signSpy = jest.fn().mockReturnValue('jwt');
      jwt.sign = signSpy;
      mockPrisma.refreshToken.create.mockResolvedValue({});
      setHmacSecret();

      const user = { id: 'u', did: 'did:k:1', email: 'e', emailVerified: true, name: 'N', avatarUrl: null, metadata: null } as unknown as User;
      await tokenIssuer.generateTokens({ user, clientId: 'test-app', scope: 'openid', nonce: 'nonce-value' });

      // First sign call = access_token (no nonce). Second = id_token (with nonce).
      const accessClaims = signSpy.mock.calls[0][0];
      const idClaims = signSpy.mock.calls[1][0];
      expect(accessClaims.nonce).toBeUndefined();
      expect(idClaims.nonce).toBe('nonce-value');
    });

    it('omits nonce from id_token when not provided (back-compat)', async () => {
      const signSpy = jest.fn().mockReturnValue('jwt');
      jwt.sign = signSpy;
      mockPrisma.refreshToken.create.mockResolvedValue({});
      setHmacSecret();

      const user = { id: 'u', did: 'did:k:1', email: 'e', emailVerified: true, name: 'N', avatarUrl: null, metadata: null } as unknown as User;
      await tokenIssuer.generateTokens({ user, clientId: 'test-app', scope: 'openid' });

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
      const result = await clientRegistry.validateClient('test-app', 'current-secret');
      expect(result.clientId).toBe('test-app');
    });

    it('accepts the previous secret during the grace window', async () => {
      const future = new Date(Date.now() + 60_000);
      mockPrisma.oAuthClient.findFirst.mockResolvedValue(
        await buildClient('current-secret', 'old-secret', future),
      );

      const result = await clientRegistry.validateClient('test-app', 'old-secret');
      expect(result.clientId).toBe('test-app');
    });

    it('rejects the previous secret once the grace window expired', async () => {
      const past = new Date(Date.now() - 60_000);
      mockPrisma.oAuthClient.findFirst.mockResolvedValue(
        await buildClient('current-secret', 'old-secret', past),
      );

      await expect(
        clientRegistry.validateClient('test-app', 'old-secret'),
      ).rejects.toThrow('Invalid client credentials');
    });

    it('rejects an entirely wrong secret even if a previous slot exists', async () => {
      const future = new Date(Date.now() + 60_000);
      mockPrisma.oAuthClient.findFirst.mockResolvedValue(
        await buildClient('current-secret', 'old-secret', future),
      );

      await expect(
        clientRegistry.validateClient('test-app', 'random-junk'),
      ).rejects.toThrow('Invalid client credentials');
    });
  });

  describe('getAllowedOrigins', () => {
    it('should collect origins from client redirect URIs', async () => {
      mockPrisma.oAuthClient.findMany.mockResolvedValue([
        { redirectUris: ['https://app1.com/callback', 'https://app2.com/callback'] },
        { redirectUris: ['https://app3.com/callback'] },
      ]);

      const result = await origins.getAllowedOrigins();
      expect(result.has('https://app1.com')).toBe(true);
      expect(result.has('https://app2.com')).toBe(true);
      expect(result.has('https://app3.com')).toBe(true);
    });

    it('should use cache on subsequent calls', async () => {
      mockPrisma.oAuthClient.findMany.mockResolvedValue([
        { redirectUris: ['https://app.com/callback'] },
      ]);

      await origins.getAllowedOrigins();
      await origins.getAllowedOrigins();

      expect(mockPrisma.oAuthClient.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('isAllowedOrigin', () => {
    it('should return true for allowed origin', async () => {
      mockPrisma.oAuthClient.findMany.mockResolvedValue([
        { redirectUris: ['https://app.com/callback'] },
      ]);

      expect(await origins.isAllowedOrigin('https://app.com')).toBe(true);
    });

    it('should return false for unknown origin', async () => {
      mockPrisma.oAuthClient.findMany.mockResolvedValue([
        { redirectUris: ['https://app.com/callback'] },
      ]);

      expect(await origins.isAllowedOrigin('https://evil.com')).toBe(false);
    });
  });
});
