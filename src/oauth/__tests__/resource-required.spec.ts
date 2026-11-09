import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuthClient, User } from '@prisma/client';
import { Request, Response } from 'express';
import { mustNameResource } from '../resource-registry';
import { DeviceFlowService } from '../device-flow.service';
import { OAuthService } from '../oauth.service';
import { OAuthController } from '../oauth.controller';
import { OAuthClientRegistryService } from '../oauth-client-registry.service';
import { OAuthTokenIssuerService } from '../oauth-token-issuer.service';
import { ConsentService } from '../consent.service';
import { ParService } from '../par.service';
import { StepUpService } from '../step-up.service';
import { RequestObjectService } from '../request-object.service';
import { PrismaService } from '../../prisma/prisma.service';
import { fakeSettings } from '../../common/settings/settings.test-fixture';
import { AuthorizeQuery } from '../dto/oauth-requests';

/**
 * RFC 8707: a self-registered client must say which resource it wants a
 * token for. Without one the issuer fell back to `aud = client_id`, so a
 * `dcr_*` or metadata-document client held a token for no resource server in
 * particular: one that only the client's own id names, and that a resource
 * server checking `aud` against a list of client ids could mistake for a
 * product's. Now the four places such a token could be born answer
 * `invalid_target`. First-party clients from the clients/ manifest keep the
 * client-id audience, as before.
 */

const DCR = 'dcr_0123456789abcdef0123456789abcdef';
const CIMD = 'https://claude.example/oauth/client-metadata.json';
const MCP = 'https://inite.ai/api/mcp';

const row = (over: Partial<OAuthClient>) =>
  ({ isPublic: true, allowedAudiences: [], redirectUris: [], firstParty: false, ...over }) as unknown as OAuthClient;
const dcr = row({ clientId: DCR });
const cimd = row({ clientId: CIMD });
// From the clients/ manifest: a confidential product and a public one.
const initeAi = row({
  clientId: 'inite-ai',
  isPublic: false,
  firstParty: true,
  redirectUris: ['https://inite.ai/api/auth/callback'],
});
const floripa = row({ clientId: 'floripa', isPublic: true, firstParty: true });

const invalidTarget = async (fn: () => unknown) => {
  let caught: unknown;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(BadRequestException);
  expect((caught as BadRequestException).getResponse()).toMatchObject({ error: 'invalid_target' });
};

describe('mustNameResource', () => {
  it('holds dcr_* and metadata-document clients to naming a resource', () => {
    expect(mustNameResource(dcr)).toBe(true);
    expect(mustNameResource(cimd)).toBe(true);
    // dcr_* is never first-party, whatever the column says.
    expect(mustNameResource(row({ clientId: DCR, firstParty: true }))).toBe(true);
  });

  it('leaves first-party manifest clients, confidential or public, as they were', () => {
    expect(mustNameResource(initeAi)).toBe(false);
    expect(mustNameResource(floripa)).toBe(false);
    expect(mustNameResource(row({ clientId: 'inite-cli' }))).toBe(false);
  });
});

describe('/authorize refuses a dcr or metadata-document client that names no resource', () => {
  const authorize = async (client: OAuthClient, resource?: string) => {
    const res = { redirect: jest.fn() };
    const controller = new OAuthController(
      {
        normalizeScope: (s: string) => s,
        customerLaneOrg: jest.fn().mockResolvedValue(null),
      } as unknown as OAuthService,
      {
        validateClient: jest.fn().mockResolvedValue(client),
        validateRedirectUri: jest.fn().mockReturnValue(true),
        validateGrantType: jest.fn(),
      } as unknown as OAuthClientRegistryService,
      { consume: jest.fn() } as unknown as ParService,
      { isSatisfied: jest.fn().mockReturnValue(true) } as unknown as StepUpService,
      { resolve: jest.fn() } as unknown as RequestObjectService,
      { isRequired: jest.fn().mockResolvedValue(true) } as unknown as ConsentService,
    );
    const query: AuthorizeQuery = {
      response_type: 'code',
      client_id: client.clientId,
      redirect_uri: 'https://rp.example/callback',
      scope: 'openid',
      state: 's',
      code_challenge: 'challenge-abc',
      code_challenge_method: 'S256',
      ...(resource ? { resource } : {}),
    };
    const req = { headers: { host: 'auth-api.inite.test' }, session: undefined } as unknown as Request;
    await controller.authorize(query, req, res as unknown as Response);
    return res;
  };

  it('answers invalid_target before the person signs in', async () => {
    await invalidTarget(() => authorize(dcr));
    await invalidTarget(() => authorize(cimd));
  });

  it('goes on to sign-in when the resource is named', async () => {
    expect((await authorize(dcr, MCP)).redirect).toHaveBeenCalledTimes(1);
    expect((await authorize(cimd, MCP)).redirect).toHaveBeenCalledTimes(1);
  });

  it('lets a first-party client go on without one', async () => {
    expect((await authorize(initeAi)).redirect).toHaveBeenCalledTimes(1);
    expect((await authorize(floripa)).redirect).toHaveBeenCalledTimes(1);
  });
});

describe('the authorization-code exchange refuses a code that carries no resource', () => {
  const resolve = (client: OAuthClient, resource: string | null) => {
    const svc = Object.create(OAuthService.prototype) as OAuthService;
    (svc as unknown as { prisma: unknown }).prisma = {
      oAuthClient: { findUnique: jest.fn().mockResolvedValue(client) },
    };
    return (
      svc as unknown as { resolveCodeAudience(c: string, r: string | null): Promise<string | undefined> }
    ).resolveCodeAudience(client.clientId, resource);
  };

  it('answers invalid_target for a dcr or metadata-document client', async () => {
    await invalidTarget(() => resolve(dcr, null));
    await invalidTarget(() => resolve(cimd, null));
  });

  it('binds the token to the resource when the code carries one', async () => {
    await expect(resolve(dcr, MCP)).resolves.toBe(MCP);
    await expect(resolve(cimd, MCP)).resolves.toBe(MCP);
  });

  it('keeps the client-id audience for a first-party client', async () => {
    await expect(resolve(initeAi, null)).resolves.toBeUndefined();
    await expect(resolve(floripa, null)).resolves.toBeUndefined();
  });
});

describe('the device flow refuses a dcr or metadata-document client that names no resource', () => {
  it('answers invalid_target', async () => {
    await invalidTarget(() => DeviceFlowService.resolveResource(dcr, undefined));
    await invalidTarget(() => DeviceFlowService.resolveResource(cimd, null));
  });

  it('binds the device code to the resource when one is named', () => {
    expect(DeviceFlowService.resolveResource(dcr, MCP)).toBe(MCP);
    expect(DeviceFlowService.resolveResource(cimd, MCP)).toBe(MCP);
  });

  it('keeps the client-id audience for a first-party client', () => {
    expect(DeviceFlowService.resolveResource(row({ clientId: 'inite-cli', firstParty: true }), undefined)).toBeNull();
    expect(DeviceFlowService.resolveResource(initeAi, undefined)).toBeNull();
  });
});

describe('refresh refuses a dcr or metadata-document token stored without a resource', () => {
  const user = { id: 'u1', did: 'did:key:abc', email: 'a@b.com' } as unknown as User;
  let prisma: {
    oAuthClient: { findUnique: jest.Mock };
    refreshToken: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
  };
  let issuer: OAuthTokenIssuerService;

  beforeEach(() => {
    const jwt = { sign: () => 'signed.jwt' } as unknown as JwtService;
    const config = {
      get: (k: string, d?: string) => (k === 'REFRESH_TOKEN_HMAC_SECRET' ? 'test-secret' : (d ?? '')),
    } as unknown as ConfigService;
    prisma = {
      oAuthClient: { findUnique: jest.fn().mockResolvedValue({ companyId: null }) },
      refreshToken: {
        create: jest.fn().mockImplementation(({ data }: { data: unknown }) => data),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: (fn) => fn(prisma),
    };
    issuer = new OAuthTokenIssuerService(prisma as unknown as PrismaService, jwt, config, fakeSettings({}));
  });

  const refresh = (client: OAuthClient, resource: string | null) => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      clientId: client.clientId,
      userId: 'u1',
      scope: 'openid offline_access',
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
      amr: [],
      authorizationDetails: null,
      resource,
      user,
    });
    return issuer.refreshAccessToken('raw-refresh-token', client.clientId, client);
  };

  it('answers invalid_target and does not burn the token', async () => {
    await invalidTarget(() => refresh(dcr, null));
    await invalidTarget(() => refresh(cimd, null));
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rotates a token that carries its resource', async () => {
    await expect(refresh(dcr, MCP)).resolves.toMatchObject({ accessToken: 'signed.jwt' });
    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resource: MCP }) }),
    );
  });

  it('rotates a first-party token stored without a resource, as before', async () => {
    await expect(refresh(floripa, null)).resolves.toMatchObject({ accessToken: 'signed.jwt' });
    await expect(refresh(initeAi, null)).resolves.toMatchObject({ accessToken: 'signed.jwt' });
  });
});
