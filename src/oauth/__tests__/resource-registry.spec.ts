import { BadRequestException } from '@nestjs/common';
import { OAuthClient } from '@prisma/client';
import {
  assertResourceAllowed,
  isRegisteredResource,
  needsRegisteredResource,
} from '../resource-registry';
import { DeviceFlowService } from '../device-flow.service';
import { OAuthService } from '../oauth.service';
import { OAuthM2mService } from '../oauth-m2m.service';

/**
 * S6 (family-mcp-2026-10): a self-registered client used to get a token for
 * any `resource` it named, `brain` and `inite-ai` included, and resource
 * servers read those audiences as first-party. A client with no allow-list of
 * its own now binds only to a registered family resource.
 */

const DCR = 'dcr_0123456789abcdef0123456789abcdef';
const SERVICES = 'https://inite.services/mcp/acme';
const INITE_MCP = 'https://inite.ai/api/mcp';

const client = (over: Partial<OAuthClient> = {}) =>
  ({ clientId: DCR, isPublic: true, allowedAudiences: [], ...over }) as unknown as OAuthClient;

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

describe('isRegisteredResource', () => {
  it('accepts https URLs on a family domain or its subdomains', () => {
    expect(isRegisteredResource(SERVICES)).toBe(true);
    expect(isRegisteredResource(INITE_MCP)).toBe(true);
    expect(isRegisteredResource('https://acme.inite.ai/mcp')).toBe(true);
    expect(isRegisteredResource('https://brain.inite.ai/mcp')).toBe(true);
    expect(isRegisteredResource('https://www.mikefluff.com/mcp')).toBe(true);
  });

  it('refuses bare identifiers, foreign hosts and look-alikes', () => {
    expect(isRegisteredResource('brain')).toBe(false);
    expect(isRegisteredResource('inite-ai')).toBe(false);
    expect(isRegisteredResource('https://evil.example.com/mcp')).toBe(false);
    expect(isRegisteredResource('https://inite.ai.evil.com/mcp')).toBe(false);
    expect(isRegisteredResource('https://evilinite.ai/mcp')).toBe(false);
    expect(isRegisteredResource('http://inite.ai/api/mcp')).toBe(false);
    expect(isRegisteredResource('https://inite.ai:8443/api/mcp')).toBe(false);
    expect(isRegisteredResource('https://user@inite.ai/api/mcp')).toBe(false);
    expect(isRegisteredResource(`${INITE_MCP}#x`)).toBe(false);
  });

  it('extends through OAUTH_RESOURCE_REGISTRY with exact URLs or origins', () => {
    const env = 'http://localhost:3000, https://staging.example.com/mcp';
    expect(isRegisteredResource('http://localhost:3000/mcp/acme', env)).toBe(true);
    expect(isRegisteredResource('https://staging.example.com/mcp', env)).toBe(true);
    expect(isRegisteredResource('https://staging.example.com/other', env)).toBe(false);
    expect(isRegisteredResource('http://localhost:4000/mcp', env)).toBe(false);
  });
});

describe('needsRegisteredResource', () => {
  it('covers dcr_ clients and public clients without an allow-list', () => {
    expect(needsRegisteredResource(client())).toBe(true);
    expect(needsRegisteredResource(client({ isPublic: false }))).toBe(true);
    expect(needsRegisteredResource(client({ clientId: 'inite-cli', isPublic: true }))).toBe(true);
  });

  it('leaves restricted clients and confidential machine clients to their own rules', () => {
    expect(needsRegisteredResource(client({ allowedAudiences: ['brain'] }))).toBe(false);
    expect(needsRegisteredResource(client({ clientId: 'brain-worker', isPublic: false }))).toBe(false);
  });
});

describe('authorize step (assertResourceAllowed)', () => {
  it('refuses a dcr client asking for a foreign host or a first-party id', () => {
    invalidTarget(() => assertResourceAllowed(client(), 'https://evil.example.com/mcp'));
    invalidTarget(() => assertResourceAllowed(client(), 'brain'));
    invalidTarget(() => assertResourceAllowed(client(), 'inite-ai'));
  });

  it('lets a dcr client bind to a family MCP endpoint, and to nothing at all', () => {
    expect(() => assertResourceAllowed(client(), SERVICES)).not.toThrow();
    expect(() => assertResourceAllowed(client(), undefined)).not.toThrow();
  });
});

describe('a confidential client with no allowedAudiences binds only to itself', () => {
  const shop = {
    clientId: 'inite-shop',
    isPublic: false,
    allowedAudiences: [] as string[],
    redirectUris: ['https://inite.shop/callback', 'http://localhost:3000/callback'],
  };

  it('refuses another product, brain or inite-ai', () => {
    invalidTarget(() => assertResourceAllowed(shop, 'brain'));
    invalidTarget(() => assertResourceAllowed(shop, 'inite-ai'));
    invalidTarget(() => assertResourceAllowed(shop, 'https://brain.inite.ai/mcp'));
    invalidTarget(() => assertResourceAllowed(shop, 'https://inite.food/api'));
    invalidTarget(() => assertResourceAllowed(shop, 'http://localhost:3000/api'));
  });

  it('lets it name its own id or its own https origin', () => {
    expect(() => assertResourceAllowed(shop, 'inite-shop')).not.toThrow();
    expect(() => assertResourceAllowed(shop, 'https://inite.shop/mcp')).not.toThrow();
    expect(() => assertResourceAllowed(shop, undefined)).not.toThrow();
  });
});

describe('authorization_code: resolveCodeAudience', () => {
  const svcFor = (row: Partial<OAuthClient> | null) => {
    const svc = Object.create(OAuthService.prototype) as OAuthService;
    (svc as unknown as { prisma: unknown }).prisma = {
      oAuthClient: { findUnique: jest.fn().mockResolvedValue(row) },
    };
    return (clientId: string, resource: string | null) =>
      (
        svc as unknown as {
          resolveCodeAudience(c: string, r: string | null): Promise<string | undefined>;
        }
      ).resolveCodeAudience(clientId, resource);
  };

  it('refuses a dcr client asking for a foreign host', async () => {
    const resolve = svcFor({ allowedAudiences: [], isPublic: true });
    await expect(resolve(DCR, 'https://evil.example.com/mcp')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a dcr client asking for `brain`', async () => {
    const resolve = svcFor({ allowedAudiences: [], isPublic: true });
    await expect(resolve(DCR, 'brain')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('binds a dcr client to https://inite.services/mcp/acme', async () => {
    const resolve = svcFor({ allowedAudiences: [], isPublic: true });
    await expect(resolve(DCR, SERVICES)).resolves.toBe(SERVICES);
  });

  it('binds inite-cli to https://inite.ai/api/mcp', async () => {
    const resolve = svcFor({ allowedAudiences: [], isPublic: true });
    await expect(resolve('inite-cli', INITE_MCP)).resolves.toBe(INITE_MCP);
  });

  it('keeps the client-id audience when no resource is asked for', async () => {
    const resolve = svcFor({ allowedAudiences: [], isPublic: true });
    await expect(resolve(DCR, null)).resolves.toBeUndefined();
  });

  it('refuses a product client asking for brain at the token step', async () => {
    const resolve = svcFor({
      allowedAudiences: [],
      isPublic: false,
      redirectUris: ['https://inite.travel/callback'],
    });
    await expect(resolve('inite-travel', 'brain')).rejects.toBeInstanceOf(BadRequestException);
    await expect(resolve('inite-travel', 'https://inite.travel/api')).resolves.toBe(
      'https://inite.travel/api',
    );
  });

  it('holds a restricted client to its own list, unchanged', async () => {
    const resolve = svcFor({ allowedAudiences: ['brain'], isPublic: false });
    await expect(resolve('brain-console', 'brain')).resolves.toBe('brain');
    await expect(resolve('brain-console', SERVICES)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('device grant: DeviceFlowService.resolveResource', () => {
  it('lets inite-cli bind to https://inite.ai/api/mcp', () => {
    expect(
      DeviceFlowService.resolveResource(client({ clientId: 'inite-cli' }), INITE_MCP),
    ).toBe(INITE_MCP);
  });

  it('refuses inite-cli or a dcr client asking for a non-family resource', () => {
    invalidTarget(() =>
      DeviceFlowService.resolveResource(client({ clientId: 'inite-cli' }), 'https://evil.example.com/mcp'),
    );
    invalidTarget(() => DeviceFlowService.resolveResource(client(), 'https://evil.example.com/x'));
  });

  it('holds a restricted client to its list, unchanged', () => {
    const restricted = client({ clientId: 'partner', allowedAudiences: ['https://partner.test/mcp'] });
    expect(DeviceFlowService.resolveResource(restricted, 'https://partner.test/mcp')).toBe(
      'https://partner.test/mcp',
    );
  });
});

describe('client_credentials and token exchange: resolveExchangeAudience', () => {
  const resolve = (c: OAuthClient, audience?: string) =>
    (
      Object.create(OAuthM2mService.prototype) as unknown as {
        resolveExchangeAudience(c: OAuthClient, a?: string): string;
      }
    ).resolveExchangeAudience(c, audience);

  it('refuses a dcr client naming `brain`, `inite-ai` or a foreign host', () => {
    expect(() => resolve(client({ isPublic: false }), 'brain')).toThrow(BadRequestException);
    expect(() => resolve(client({ isPublic: false }), 'inite-ai')).toThrow(/Audience/);
    expect(() => resolve(client({ isPublic: false }), 'https://evil.example.com')).toThrow(
      BadRequestException,
    );
  });

  it('lets a dcr client name a family resource, and defaults to its id', () => {
    expect(resolve(client({ isPublic: false }), SERVICES)).toBe(SERVICES);
    expect(resolve(client({ isPublic: false }))).toBe(DCR);
  });

  it('leaves operator-provisioned machine clients exactly as before', () => {
    const machine = client({ clientId: 'chat-api', isPublic: false });
    expect(resolve(machine, 'brain')).toBe('brain');
    const restricted = client({ clientId: 'chat-api', isPublic: false, allowedAudiences: ['brain'] });
    expect(resolve(restricted, 'brain')).toBe('brain');
    expect(() => resolve(restricted, 'billing')).toThrow(/not allowed/);
  });
});
