import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { AgentsService } from '../agents.service';
import { OAuthTokenIssuerService } from '../oauth-token-issuer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SsfEmitterService } from '../../ssf/ssf-emitter.service';
import { CAEP_EVENTS } from '../../ssf/caep-event-types';
import { fakeSettings } from '../../common/settings/settings.test-fixture';
import { normalizeWalletGrant } from '../wallet-grant';

/**
 * AI agents as principals: a third-party application acting for a person is
 * an agent with its own did:web, named in the token's `act`; INITE's own
 * applications are not; disconnecting retires the agent and tells resource
 * servers.
 */
describe('Agents', () => {
  const user = { id: 'u1', did: 'did:key:person', email: 'a@b.com' } as unknown as User;
  const AGENT_ID = '11111111-2222-4333-8444-555555555555';

  const configWith = (issuer: string) =>
    ({
      get: (k: string, d?: string) =>
        k === 'JWT_ISSUER' ? issuer : k === 'REFRESH_TOKEN_HMAC_SECRET' ? 'test-secret' : d ?? '',
    }) as unknown as ConfigService;

  interface Row {
    id: string;
    userId: string;
    clientId: string;
    revokedAt: Date | null;
    walletGrant: unknown;
    [key: string]: unknown;
  }
  interface Query {
    where: { userId?: string; clientId?: string; id?: string | { in: string[] } };
    data?: Record<string, unknown>;
  }
  let agents: Row[];
  let clients: Record<string, { clientId: string; firstParty: boolean; companyId: null }>;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let ssf: { emit: jest.Mock };

  beforeEach(() => {
    agents = [];
    clients = {
      dcr_agent: { clientId: 'dcr_agent', firstParty: false, companyId: null },
      site: { clientId: 'site', firstParty: true, companyId: null },
    };
    prisma = {
      oAuthClient: {
        findUnique: jest.fn(async ({ where }: Query) => clients[where.clientId!] ?? null),
      },
      agent: {
        findFirst: jest.fn(async ({ where }: Query) =>
          agents.find(
            (a) => a.userId === where.userId && a.clientId === where.clientId && !a.revokedAt,
          ) ?? null,
        ),
        findMany: jest.fn(async ({ where }: Query) =>
          agents
            .filter(
              (a) =>
                a.userId === where.userId &&
                (!where.clientId || a.clientId === where.clientId) &&
                !a.revokedAt,
            )
            .map((a) => ({ ...a, user: { did: user.did } })),
        ),
        create: jest.fn(async ({ data }: Query) => {
          const row = { id: agents.length ? `${AGENT_ID.slice(0, -1)}${agents.length}` : AGENT_ID, revokedAt: null, walletGrant: null, createdAt: new Date(), ...data };
          agents.push(row as unknown as Row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: Query) => Object.assign(agents.find((a) => a.id === where.id)!, data)),
        updateMany: jest.fn(async ({ where, data }: Query) => {
          const hit = agents.filter((a) => (where.id as { in: string[] }).in.includes(a.id));
          hit.forEach((a) => Object.assign(a, data));
          return { count: hit.length };
        }),
        findUnique: jest.fn(async ({ where }: Query) => {
          const a = agents.find((x) => x.id === where.id);
          return a ? { ...a, user: { did: user.did }, client: { clientId: a.clientId, name: 'Some Agent' } } : null;
        }),
      },
      refreshToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    };
    ssf = { emit: jest.fn().mockResolvedValue(undefined) };
  });

  const service = (issuer = 'https://auth-api.inite.ai') =>
    new AgentsService(prisma as unknown as PrismaService, configWith(issuer), ssf as unknown as SsfEmitterService);

  it('names an agent with did:web under the issuer, port percent-encoded', () => {
    expect(service().didOf(AGENT_ID)).toBe(`did:web:auth-api.inite.ai:agents:${AGENT_ID}`);
    expect(service('http://localhost:3002').didOf(AGENT_ID)).toBe(
      `did:web:localhost%3A3002:agents:${AGENT_ID}`,
    );
  });

  it('makes one agent per person and third-party application, none for INITE’s own', async () => {
    const s = service();
    const first = await s.actFor('u1', 'dcr_agent');
    const again = await s.actFor('u1', 'dcr_agent');
    expect(first).toEqual({ sub: `did:web:auth-api.inite.ai:agents:${AGENT_ID}`, client_id: 'dcr_agent' });
    expect(again).toEqual(first);
    expect(agents).toHaveLength(1);
    expect(await s.actFor('u1', 'site')).toBeUndefined();
  });

  it('puts the agent in the access token’s act, sub staying the person', async () => {
    const signed: Array<Record<string, unknown>> = [];
    const jwt = { sign: (p: Record<string, unknown>) => (signed.push(p), 'signed.jwt') } as unknown as JwtService;
    const issuer = new OAuthTokenIssuerService(
      prisma as unknown as PrismaService,
      jwt,
      configWith('https://auth-api.inite.ai'),
      fakeSettings({}),
      undefined,
      undefined,
      service(),
    );
    const grant = normalizeWalletGrant({ type: 'inite_wallet', limits: { per_payment: '5' } });
    await issuer.generateTokens({ user, clientId: 'dcr_agent', scope: 'openid', authorizationDetails: [grant] });
    expect(signed[0]).toMatchObject({
      sub: 'did:key:person',
      act: { sub: `did:web:auth-api.inite.ai:agents:${AGENT_ID}`, client_id: 'dcr_agent' },
      authorization_details: [grant],
    });
    // The wallet grant is kept on the agent for the account page.
    expect(agents[0]!.walletGrant).toEqual(grant);

    signed.length = 0;
    await issuer.generateTokens({ user, clientId: 'site', scope: 'openid' });
    expect(signed[0]).not.toHaveProperty('act');
  });

  it('retires the agent on disconnect and tells resource servers', async () => {
    const s = service();
    await s.actFor('u1', 'dcr_agent');
    expect(await s.revoke('u1', 'dcr_agent')).toBe(1);
    expect(agents[0]!.revokedAt).toBeInstanceOf(Date);
    expect(ssf.emit).toHaveBeenCalledWith({
      eventType: CAEP_EVENTS.sessionRevoked,
      subject: 'did:key:person',
      claims: {
        agent: `did:web:auth-api.inite.ai:agents:${AGENT_ID}`,
        client_id: 'dcr_agent',
        reason: 'agent_disconnected',
      },
    });
    // Connecting again makes a new agent, with a new DID.
    const next = await s.actFor('u1', 'dcr_agent');
    expect(next!.sub).not.toBe(`did:web:auth-api.inite.ai:agents:${AGENT_ID}`);
  });

  it('serves a DID document naming the person and the application; deactivated once retired', async () => {
    const s = service();
    await s.actFor('u1', 'dcr_agent');
    const live = await s.document(AGENT_ID);
    expect(live).toMatchObject({
      deactivated: false,
      document: {
        id: `did:web:auth-api.inite.ai:agents:${AGENT_ID}`,
        controller: 'did:key:person',
        service: [{ type: 'OAuthClient', serviceEndpoint: { client_id: 'dcr_agent' } }],
      },
    });
    await s.revoke('u1', 'dcr_agent');
    expect((await s.document(AGENT_ID))!.deactivated).toBe(true);
    expect(await s.document('not-a-uuid')).toBeNull();
  });
});
