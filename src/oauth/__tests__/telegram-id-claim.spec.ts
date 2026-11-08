import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { OAuthTokenIssuerService } from '../oauth-token-issuer.service';
import { OAuthService } from '../oauth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthController } from '../../common/health.controller';
import { fakeSettings } from '../../common/settings/settings.test-fixture';
import { dcrSupportedScopes, permittedScopes, supportedScopes } from '../oauth-scopes.registry';
import { TELEGRAM_ID_CLAIM, telegramIdClaim } from '../telegram-claim';

/**
 * Issue #299: `telegram_id` reaches a first-party product that asked for the
 * `telegram` scope, and nobody else. The security property: a third-party,
 * dynamically registered or metadata-document client never learns a person's
 * Telegram id, even when its allow-list or its token names the scope.
 */
const TG_ID = '7123456789'; // past 2^31: a JSON number would be at risk in some clients

function fakePrisma(opts: { firstParty?: boolean; telegram?: boolean } = {}) {
  return {
    oAuthClient: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { clientId: string } }) =>
          Promise.resolve({
            clientId: where.clientId,
            firstParty: opts.firstParty ?? true,
            companyId: null,
          }),
        ),
    },
    oAuthIdentity: {
      findFirst: jest
        .fn()
        .mockResolvedValue(opts.telegram === false ? null : { providerSubject: TG_ID }),
    },
    refreshToken: { create: jest.fn().mockImplementation(({ data }: { data: unknown }) => data) },
    membership: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'u1', did: 'did:key:zU1', email: 'a@b.test' }),
    },
  };
}

describe('telegram scope', () => {
  const firstParty = {
    clientId: 'floripa',
    allowedScopes: ['telegram'],
    firstParty: true,
    isPublic: true,
  };

  it('is granted to a first-party client that lists it', () => {
    expect(permittedScopes(firstParty, 'openid telegram')).toEqual(['openid', 'telegram']);
  });

  it('is dropped for a client that is not first-party, even when its allow-list names it', () => {
    expect(permittedScopes({ ...firstParty, firstParty: false }, 'openid telegram')).toEqual([
      'openid',
    ]);
    expect(permittedScopes({ ...firstParty, firstParty: undefined }, 'openid telegram')).toEqual([
      'openid',
    ]);
  });

  it('is never open to dynamic registration or a public agent client', () => {
    expect(dcrSupportedScopes()).not.toContain('telegram');
    expect(permittedScopes({ clientId: 'dcr_abc', firstParty: true }, 'openid telegram')).toEqual([
      'openid',
    ]);
    expect(
      permittedScopes({ clientId: 'inite-cli', isPublic: true, firstParty: false }, 'telegram'),
    ).toEqual([]);
  });

  it('is advertised with its claim in discovery', () => {
    expect(supportedScopes()).toContain('telegram');
    const config = { get: (_k: string, d?: string) => d } as unknown as ConfigService;
    const health = new HealthController(
      config,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      fakeSettings({}),
    );
    const meta = health.openidConfiguration() as {
      claims_supported: string[];
      scopes_supported: string[];
    };
    expect(meta.claims_supported).toContain(TELEGRAM_ID_CLAIM);
    expect(meta.scopes_supported).toContain('telegram');
  });
});

describe('telegramIdClaim', () => {
  const ask = { userId: 'u1', clientId: 'floripa', scope: 'openid telegram' };

  it('gives the Telegram id as a string to a first-party client with the scope', async () => {
    const claim = await telegramIdClaim(fakePrisma() as never, ask);
    expect(claim).toEqual({ telegram_id: TG_ID });
    expect(typeof claim.telegram_id).toBe('string');
  });

  it('reads the scope from a principal set as well', async () => {
    expect(
      await telegramIdClaim(fakePrisma() as never, {
        ...ask,
        scope: new Set(['openid', 'telegram']),
      }),
    ).toEqual({
      telegram_id: TG_ID,
    });
  });

  it('gives nothing without the scope, and does not even look', async () => {
    const prisma = fakePrisma();
    expect(await telegramIdClaim(prisma as never, { ...ask, scope: 'openid profile' })).toEqual({});
    expect(prisma.oAuthIdentity.findFirst).not.toHaveBeenCalled();
  });

  it('gives nothing to a client that is not first-party, whatever its token says', async () => {
    const prisma = fakePrisma({ firstParty: false });
    expect(await telegramIdClaim(prisma as never, ask)).toEqual({});
    expect(prisma.oAuthIdentity.findFirst).not.toHaveBeenCalled();
  });

  it('gives nothing to a dynamically registered client marked first-party', async () => {
    expect(await telegramIdClaim(fakePrisma() as never, { ...ask, clientId: 'dcr_abc' })).toEqual(
      {},
    );
  });

  it('gives nothing to an unknown client (a metadata-document client has no row)', async () => {
    const prisma = fakePrisma();
    prisma.oAuthClient.findUnique.mockResolvedValue(null);
    expect(
      await telegramIdClaim(prisma as never, {
        ...ask,
        clientId: 'https://app.example/client.json',
      }),
    ).toEqual({});
  });

  it('gives nothing to a person without a Telegram identity', async () => {
    expect(await telegramIdClaim(fakePrisma({ telegram: false }) as never, ask)).toEqual({});
  });
});

describe('telegram_id in tokens and /userinfo', () => {
  const user = {
    id: 'u1',
    did: 'did:key:zU1',
    email: 'a@b.test',
    metadata: null,
  } as unknown as User;

  function issue(prisma: ReturnType<typeof fakePrisma>, scope: string) {
    const signed: Array<Record<string, unknown>> = [];
    const jwt = {
      sign: (p: Record<string, unknown>) => (signed.push(p), 'jwt'),
    } as unknown as JwtService;
    const config = {
      get: (k: string, d?: string) =>
        k === 'REFRESH_TOKEN_HMAC_SECRET' ? 'test-secret' : (d ?? ''),
    } as unknown as ConfigService;
    const issuer = new OAuthTokenIssuerService(
      prisma as unknown as PrismaService,
      jwt,
      config,
      fakeSettings({}),
    );
    return issuer.generateTokens({ user, clientId: 'floripa', scope }).then(() => {
      const [access, id] = signed as [Record<string, unknown>, Record<string, unknown>];
      return { access, id };
    });
  }

  it('puts it in the id_token only, never the access token', async () => {
    const { access, id } = await issue(fakePrisma(), 'openid telegram');
    expect(id[TELEGRAM_ID_CLAIM]).toBe(TG_ID);
    expect(access).not.toHaveProperty(TELEGRAM_ID_CLAIM);
  });

  it('leaves the id_token without it when the scope was not granted', async () => {
    const { id } = await issue(fakePrisma(), 'openid profile email');
    expect(id).not.toHaveProperty(TELEGRAM_ID_CLAIM);
  });

  function oauthService(prisma: ReturnType<typeof fakePrisma>): OAuthService {
    const identity = { getWallets: jest.fn().mockResolvedValue([]) };
    return new OAuthService(
      prisma as never,
      {} as never,
      {} as never,
      identity as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('answers /userinfo with it for the same grant', async () => {
    const info = await oauthService(fakePrisma()).getUserInfo('u1', {
      clientId: 'floripa',
      scope: new Set(['openid', 'telegram']),
    });
    expect(info[TELEGRAM_ID_CLAIM]).toBe(TG_ID);
  });

  it('answers /userinfo without it for a third-party grant or none', async () => {
    const third = await oauthService(fakePrisma({ firstParty: false })).getUserInfo('u1', {
      clientId: 'someone-else',
      scope: 'openid telegram',
    });
    expect(third).not.toHaveProperty(TELEGRAM_ID_CLAIM);
    expect(await oauthService(fakePrisma()).getUserInfo('u1')).not.toHaveProperty(
      TELEGRAM_ID_CLAIM,
    );
  });
});
