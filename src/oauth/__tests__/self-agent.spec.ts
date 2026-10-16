import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthClient } from '@prisma/client';
import { OAuthM2mService } from '../oauth-m2m.service';
import { JwksService } from '../../common/jwks.service';
import { fakeSettings } from '../../common/settings/settings.test-fixture';
import { DcrReaperService } from '../dcr-reaper.service';
import { agentDid, isSelfAgent, selfAgentDocument } from '../self-agent';

/**
 * An agent registers itself (RFC 7591) with its own key and client_credentials,
 * with no person behind it. It is somebody: its tokens carry its did:web as
 * `sub`, and the DID document publishes its key.
 */
describe('Self-registered agents', () => {
  const ISSUER = 'https://auth-api.inite.ai';
  const key = { kty: 'EC', crv: 'P-256', x: 'xx', y: 'yy', kid: 'agent-key', use: 'sig' };
  const agent = {
    clientId: 'dcr_0123456789abcdef0123456789abcdef',
    name: 'Shopping agent',
    tokenEndpointAuthMethod: 'private_key_jwt',
    allowedGrants: ['client_credentials'],
    allowedScopes: ['openid'],
    allowedAudiences: [],
    companyId: null,
    jwks: { keys: [key] },
    active: true,
  } as unknown as OAuthClient;

  function m2m() {
    const signed: Array<Record<string, unknown>> = [];
    const jwt = {
      sign: (payload: Record<string, unknown>, opts: Record<string, unknown>) => {
        signed.push({ ...payload, aud: opts.audience });
        return 'signed.jwt';
      },
    } as unknown as JwtService;
    const config = {
      get: (k: string, d?: string) => (k === 'JWT_ISSUER' ? ISSUER : (d ?? '')),
    } as unknown as ConfigService;
    const service = new OAuthM2mService(jwt, config, { isRs256Enabled: () => false } as unknown as JwksService, fakeSettings({}));
    return { service, signed };
  }

  it('is a dcr_ client with its own inline key, client_credentials and no company', () => {
    expect(isSelfAgent(agent)).toBe(true);
    // With the client secret instead of a key: still an agent, with no keys to publish.
    expect(isSelfAgent({ ...agent, tokenEndpointAuthMethod: 'client_secret_post', jwks: null })).toBe(true);
    expect(isSelfAgent({ ...agent, tokenEndpointAuthMethod: 'none' })).toBe(false);
    expect(isSelfAgent({ ...agent, allowedGrants: ['authorization_code'] })).toBe(false);
    expect(isSelfAgent({ ...agent, companyId: 'co' })).toBe(false);
    expect(isSelfAgent({ ...agent, jwks: null })).toBe(false); // private_key_jwt with no key
    expect(isSelfAgent({ ...agent, clientId: 'shop-backend' })).toBe(false);
  });

  it('gets its did:web as sub, for the audience it asked for', async () => {
    const { service, signed } = m2m();
    await service.issueClientCredentialsToken({ client: agent, audience: 'https://billing.inite.ai' });
    expect(signed[0]).toMatchObject({
      sub: 'did:web:auth-api.inite.ai:agents:dcr_0123456789abcdef0123456789abcdef',
      client_id: agent.clientId,
      aud: 'https://billing.inite.ai',
    });
  });

  it('leaves other machine clients as they were', async () => {
    const { service, signed } = m2m();
    await service.issueClientCredentialsToken({
      client: { ...agent, clientId: 'm2m', companyId: 'co-1' } as OAuthClient,
    });
    expect(signed[0]!.sub).toBe('co-1');
  });

  it('publishes its key in the DID document, without private parts', () => {
    const doc = selfAgentDocument(ISSUER, { ...agent, jwks: { keys: [{ ...key, d: 'secret' }] } });
    const id = agentDid(ISSUER, agent.clientId);
    expect(doc).toMatchObject({
      id,
      controller: id,
      verificationMethod: [{ id: `${id}#agent-key`, type: 'JsonWebKey2020', controller: id, publicKeyJwk: key }],
      authentication: [`${id}#agent-key`],
      assertionMethod: [`${id}#agent-key`],
    });
    expect(JSON.stringify(doc)).not.toContain('secret');
  });

  it('is never reaped as an unused registration', async () => {
    const old = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const prisma = {
      oAuthClient: {
        findMany: jest.fn().mockResolvedValue([
          { ...agent, id: 'a', createdAt: old },
          { id: 'b', clientId: 'dcr_ffffffffffffffffffffffffffffffff', allowedGrants: ['authorization_code'], createdAt: old },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      refreshToken: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await new DcrReaperService(prisma as never).reapStaleClients();
    expect(prisma.oAuthClient.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['b'] } } });
  });
});
