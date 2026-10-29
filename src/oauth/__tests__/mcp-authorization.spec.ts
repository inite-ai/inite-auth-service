import { BadRequestException } from '@nestjs/common';
import { OAuthClient } from '@prisma/client';
import { Request } from 'express';
import {
  dcrSupportedScopes,
  grantableScope,
  isDynamicClientId,
  MIKEFLUFF_SCOPES,
  supportedScopes,
} from '../oauth-scopes.registry';
import { DeviceFlowService } from '../device-flow.service';
import { TokenGrantService } from '../token-grant.service';
import { OAuthRequestController, deviceVerificationUri } from '../oauth-request.controller';
import { OAuthService } from '../oauth.service';
import { OAuthAuditService } from '../../audit/oauth-audit.service';
import { MetricsService } from '../../common/metrics.service';
import { DpopService } from '../dpop.service';
import { OAuthTokenIssuerService } from '../oauth-token-issuer.service';
import { OAuthM2mService } from '../oauth-m2m.service';
import { MtlsService } from '../mtls.service';
import { OAuthClientRegistryService } from '../oauth-client-registry.service';
import { ParService } from '../par.service';
import { ClientAuthService } from '../client-auth.service';
import { RequestObjectService } from '../request-object.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * MCP authorization for www.mikefluff.com/mcp: the scopes an agent asks a
 * person for, the cap on what a self-registered (RFC 7591) client can be
 * granted, and RFC 8707 resource indicators on the device grant.
 */
const MCP_RESOURCE = 'https://www.mikefluff.com/mcp';

describe('mikefluff scopes in the registry', () => {
  it('advertises both scopes in discovery and lets DCR clients ask for them', () => {
    for (const s of MIKEFLUFF_SCOPES) {
      expect(supportedScopes()).toContain(s);
      expect(dcrSupportedScopes()).toContain(s);
    }
    expect(MIKEFLUFF_SCOPES).toEqual(['mikefluff:purchase', 'mikefluff:booking']);
  });

  it('keeps the sensitive brain scopes out of open registration', () => {
    expect(dcrSupportedScopes()).not.toContain('brain:admin');
    expect(dcrSupportedScopes()).not.toContain('brain:read_pii');
  });
});

describe('billing scope in the registry', () => {
  // Claude's connector asks for exactly the scope billing's MCP names in its
  // 401 challenge; it has to be advertised and grantable to a DCR client.
  it('advertises billing:account in discovery and lets DCR clients ask for it', () => {
    expect(supportedScopes()).toContain('billing:account');
    expect(dcrSupportedScopes()).toContain('billing:account');
  });

  it('is granted to a dynamically registered client that asks for it', () => {
    expect(grantableScope('dcr_abc', 'billing:account offline_access')).toBe(
      'billing:account offline_access',
    );
  });
});

describe('fund scopes in the registry', () => {
  // inite.fund's MCP (strateg) names fund:read / fund:write in its PRM; a
  // connector that self-registers has to be able to ask for both.
  it('advertises fund:read and fund:write and lets DCR clients ask for them', () => {
    for (const scope of ['fund:read', 'fund:write']) {
      expect(supportedScopes()).toContain(scope);
      expect(dcrSupportedScopes()).toContain(scope);
    }
  });

  it('is granted to a dynamically registered client that asks for it', () => {
    expect(grantableScope('dcr_abc', 'openid fund:read fund:write')).toBe(
      'openid fund:read fund:write',
    );
  });
});

describe('grantableScope', () => {
  it('recognises dynamically registered client ids', () => {
    expect(isDynamicClientId('dcr_abc')).toBe(true);
    expect(isDynamicClientId('mikefluff')).toBe(false);
    expect(isDynamicClientId(undefined)).toBe(false);
  });

  it('drops scopes a DCR client may not be granted, keeping the rest', () => {
    expect(
      grantableScope('dcr_abc', 'openid email brain:admin mikefluff:purchase registry:publish'),
    ).toBe('openid email mikefluff:purchase');
  });

  it('falls back to the default when a DCR client asked only for withheld scopes', () => {
    expect(grantableScope('dcr_abc', 'brain:admin brain:read_pii')).toBe('openid profile email');
  });

  it('holds an operator-provisioned client to its own allowedScopes plus the OIDC baseline', () => {
    const shop = { clientId: 'inite-shop', allowedScopes: ['openid', 'profile', 'email'] };
    // A first-party product client never sees a consent screen: brain:admin
    // and fund:write must not ride along just because it asked.
    expect(grantableScope(shop, 'openid profile email offline_access brain:admin fund:write')).toBe(
      'openid profile email offline_access',
    );
    const brain = { clientId: 'brain-landing', allowedScopes: ['openid', 'brain:admin'] };
    expect(grantableScope(brain, 'openid brain:admin')).toBe('openid brain:admin');
    expect(grantableScope(undefined, '')).toBe('openid profile email');
  });

  it('grants a client known only by id the OIDC baseline and nothing more', () => {
    expect(grantableScope('brain-console', 'openid brain:admin')).toBe('openid');
  });

  it('dedupes and collapses whitespace', () => {
    expect(grantableScope('dcr_x', '  openid   openid mikefluff:booking ')).toBe(
      'openid mikefluff:booking',
    );
  });

  it('is what OAuthService.normalizeScope applies when given the client', () => {
    const svc = Object.create(OAuthService.prototype) as OAuthService;
    expect(svc.normalizeScope('openid brain:admin', { clientId: 'dcr_1' })).toBe('openid');
    expect(
      svc.normalizeScope('openid brain:admin', { clientId: 'inite-travel', allowedScopes: ['openid'] }),
    ).toBe('openid');
    expect(svc.normalizeScope('openid brain:admin')).toBe('openid');
  });
});

describe('device grant — RFC 8707 resource', () => {
  // inite-cli is a public client (system-clients.seeder.ts).
  const client = (allowedAudiences: string[] = []) =>
    ({ clientId: 'inite-cli', isPublic: true, allowedAudiences }) as unknown as OAuthClient;

  const invalidTarget = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({ error: 'invalid_target' });
      return;
    }
    throw new Error('expected invalid_target');
  };

  it('accepts an absolute URI and treats absence as no resource', () => {
    expect(DeviceFlowService.resolveResource(client(), MCP_RESOURCE)).toBe(MCP_RESOURCE);
    expect(DeviceFlowService.resolveResource(client(), undefined)).toBeNull();
  });

  it('refuses a relative URI or one with a fragment', () => {
    invalidTarget(() => DeviceFlowService.resolveResource(client(), '/mcp'));
    invalidTarget(() => DeviceFlowService.resolveResource(client(), `${MCP_RESOURCE}#x`));
  });

  it('holds a client with allowedAudiences to that list', () => {
    expect(DeviceFlowService.resolveResource(client([MCP_RESOURCE]), MCP_RESOURCE)).toBe(
      MCP_RESOURCE,
    );
    invalidTarget(() => DeviceFlowService.resolveResource(client(['brain']), MCP_RESOURCE));
  });

  it('stores the resource on the pending row', async () => {
    const create = jest.fn().mockImplementation(async ({ data }) => data);
    const prisma = {
      deviceAuthorization: { findUnique: jest.fn().mockResolvedValue(null), create },
    };
    const svc = new DeviceFlowService(prisma as unknown as PrismaService);
    await svc.issue({
      client: client(),
      scope: 'openid mikefluff:purchase',
      resource: MCP_RESOURCE,
      verificationUri: 'https://auth.inite.ai/device',
    });
    expect(create.mock.calls[0][0].data).toMatchObject({
      resource: MCP_RESOURCE,
      scope: 'openid mikefluff:purchase',
    });
  });

  describe('token exchange', () => {
    const build = (approved: Record<string, unknown>) => {
      const generateTokens = jest.fn().mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 900,
        scope: 'openid mikefluff:purchase',
      });
      const grants = new TokenGrantService(
        {
          findUserById: jest.fn().mockResolvedValue({ id: 'u1', did: 'did:inite:1' }),
        } as unknown as OAuthService,
        { record: jest.fn() } as unknown as OAuthAuditService,
        { tokensIssued: { inc: jest.fn() } } as unknown as MetricsService,
        {} as DpopService,
        { pollForApproval: jest.fn().mockResolvedValue(approved) } as unknown as DeviceFlowService,
        { generateTokens } as unknown as OAuthTokenIssuerService,
        {} as OAuthM2mService,
        {} as MtlsService,
      );
      const run = () =>
        grants.grantDeviceCode({
          req: { body: { device_code: 'dc' } } as unknown as Request,
          body: { client_id: 'inite-cli' } as never,
          client: client(),
          ctx: { ip: '127.0.0.1', userAgent: 'jest' } as never,
        });
      return { generateTokens, run };
    };

    it('binds the access token audience to the stored resource', async () => {
      const { generateTokens, run } = build({
        userId: 'u1',
        scope: 'openid mikefluff:purchase',
        resource: MCP_RESOURCE,
      });
      const out = await run();
      expect(generateTokens.mock.calls[0][0]).toMatchObject({
        audience: MCP_RESOURCE,
        clientId: 'inite-cli',
        scope: 'openid mikefluff:purchase',
      });
      expect(out.access_token).toBe('at');
    });

    it('never grants a public client an operator-only scope', async () => {
      const { generateTokens, run } = build({
        userId: 'u1',
        scope: 'openid brain:read brain:admin registry:publish',
        resource: null,
      });
      await run();
      expect(generateTokens.mock.calls[0][0].scope).toBe('openid brain:read');
    });

    it('keeps the default audience when no resource was named', async () => {
      const { generateTokens, run } = build({ userId: 'u1', scope: 'openid', resource: null });
      await run();
      expect(generateTokens.mock.calls[0][0].audience).toBeUndefined();
    });
  });
});

describe('device verification', () => {
  const OLD = process.env.FRONTEND_URL;
  afterEach(() => {
    if (OLD === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = OLD;
  });
  const req = {
    headers: { host: 'auth-api.inite.ai', 'x-forwarded-proto': 'https' },
  } as unknown as Request;

  it('sends the person to the sign-in UI, not to the JSON API', () => {
    process.env.FRONTEND_URL = 'https://auth.inite.ai/';
    expect(deviceVerificationUri(req)).toBe('https://auth.inite.ai/device');
  });

  it('falls back to the request host without FRONTEND_URL', () => {
    delete process.env.FRONTEND_URL;
    expect(deviceVerificationUri(req)).toBe('https://auth-api.inite.ai/v1/oauth/device');
  });

  it('names the client and the resource on the lookup', async () => {
    const deviceFlow = {
      findByUserCode: jest.fn().mockResolvedValue({
        userCode: 'BCDF-GHJK',
        clientId: 'inite-cli',
        scope: 'mikefluff:purchase',
        resource: MCP_RESOURCE,
        status: 'pending',
        expiresAt: new Date(0),
      }),
    };
    const registry = {
      getClientInfo: jest.fn().mockResolvedValue({ clientId: 'inite-cli', name: 'INITE CLI' }),
    };
    const controller = new OAuthRequestController(
      registry as unknown as OAuthClientRegistryService,
      {} as ParService,
      deviceFlow as unknown as DeviceFlowService,
      {} as ClientAuthService,
      {} as RequestObjectService,
    );
    await expect(controller.deviceVerify('BCDF-GHJK')).resolves.toMatchObject({
      client_id: 'inite-cli',
      client_name: 'INITE CLI',
      resource: MCP_RESOURCE,
      scope: 'mikefluff:purchase',
    });
  });
});
