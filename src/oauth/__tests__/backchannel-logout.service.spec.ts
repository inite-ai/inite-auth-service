import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BackchannelLogoutService } from '../backchannel-logout.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('BackchannelLogoutService', () => {
  let svc: BackchannelLogoutService;
  let prisma: { oAuthClient: { findMany: jest.Mock }; refreshToken: { updateMany: jest.Mock } };
  let jwt: { sign: jest.Mock };
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    prisma = {
      oAuthClient: {
        findMany: jest.fn(),
      },
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    jwt = {
      sign: jest.fn().mockReturnValue('logout-jwt'),
    };
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    (global as typeof globalThis & { fetch?: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackchannelLogoutService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('https://auth.inite.ai') },
        },
      ],
    }).compile();

    svc = module.get<BackchannelLogoutService>(BackchannelLogoutService);
  });

  afterEach(() => {
    delete (global as { fetch?: unknown }).fetch;
  });

  it('returns 0 when no clients have a backchannel uri', async () => {
    prisma.oAuthClient.findMany.mockResolvedValue([]);
    const n = await svc.fanOut({ userDid: 'did:k:1', sid: 'sess-1' });
    expect(n).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs a signed logout_token to every registered RP', async () => {
    prisma.oAuthClient.findMany.mockResolvedValue([
      { clientId: 'rp-a', backchannelLogoutUri: 'https://a.example.com/oidc/logout' },
      { clientId: 'rp-b', backchannelLogoutUri: 'https://b.example.com/oidc/logout' },
    ]);

    const n = await svc.fanOut({ userDid: 'did:k:1', sid: 'sess-1' });
    expect(n).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [urlA, optsA] = fetchMock.mock.calls[0];
    expect(urlA).toBe('https://a.example.com/oidc/logout');
    expect(optsA.method).toBe('POST');
    expect(optsA.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(optsA.headers['Cache-Control']).toBe('no-store');
    expect((optsA.body as URLSearchParams).get('logout_token')).toBe('logout-jwt');
  });

  it('embeds the required claims in the logout_token (sub, sid, events, jti)', async () => {
    prisma.oAuthClient.findMany.mockResolvedValue([
      { clientId: 'rp-a', backchannelLogoutUri: 'https://a.example.com/oidc/logout' },
    ]);

    await svc.fanOut({ userDid: 'did:k:user1', sid: 'sess-xyz' });

    const [payload, opts] = jwt.sign.mock.calls[0];
    expect(payload.sub).toBe('did:k:user1');
    expect(payload.sid).toBe('sess-xyz');
    expect(payload.events).toEqual({
      'http://schemas.openid.net/event/backchannel-logout': {},
    });
    expect(typeof payload.jti).toBe('string');
    expect(payload.jti.length).toBeGreaterThan(20);
    // logout_token MUST NOT carry a nonce per spec
    expect(payload.nonce).toBeUndefined();
    expect(opts.audience).toBe('rp-a');
    expect(opts.issuer).toBe('https://auth.inite.ai');
    expect(opts.expiresIn).toBe(120);
  });

  it('omits sid when caller had no server session at logout', async () => {
    prisma.oAuthClient.findMany.mockResolvedValue([
      { clientId: 'rp-a', backchannelLogoutUri: 'https://a.example.com/oidc/logout' },
    ]);

    await svc.fanOut({ userDid: 'did:k:1' });

    const [payload] = jwt.sign.mock.calls[0];
    expect(payload.sid).toBeUndefined();
    expect(payload.sub).toBe('did:k:1');
  });

  it('does not throw when an RP fails — fan-out is best-effort', async () => {
    prisma.oAuthClient.findMany.mockResolvedValue([
      { clientId: 'good', backchannelLogoutUri: 'https://ok.example.com/lo' },
      { clientId: 'bad', backchannelLogoutUri: 'https://bad.example.com/lo' },
    ]);
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 204 })
      .mockRejectedValueOnce(new Error('connection refused'));

    const n = await svc.fanOut({ userDid: 'did:k:1' });
    // Both calls were attempted; both promises settled (one rejected
    // inside the service was caught and logged). fanOut counts them
    // both as 'fulfilled' from Promise.allSettled because deliver()
    // swallows the error.
    expect(n).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  describe('endRelyingPartySessions', () => {
    it('notifies the RPs first, then revokes the user\'s refresh tokens', async () => {
      const order: string[] = [];
      prisma.oAuthClient.findMany.mockImplementation(async () => {
        order.push('select-recipients');
        return [{ clientId: 'rp-a', backchannelLogoutUri: 'https://a.example.com/logout' }];
      });
      prisma.refreshToken.updateMany.mockImplementation(async () => {
        order.push('revoke');
        return { count: 3 };
      });

      const out = await svc.endRelyingPartySessions({ userDid: 'did:k:1', sid: 's' });

      expect(out).toEqual({ notified: 1, revoked: 3 });
      expect(order).toEqual(['select-recipients', 'revoke']);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { revoked: false, user: { did: 'did:k:1' } },
        data: { revoked: true, revokedAt: expect.any(Date) },
      });
    });

    it('still revokes when the fan-out fails', async () => {
      prisma.oAuthClient.findMany.mockRejectedValue(new Error('db down'));
      const out = await svc.endRelyingPartySessions({ userDid: 'did:k:1' });
      expect(out).toEqual({ notified: 0, revoked: 3 });
    });
  });
});

describe('BackchannelLogoutService: the convention', () => {
  it('notifies a first-party client at <origin>/api/auth/backchannel-logout when it registered none', async () => {
    const prisma = {
      oAuthClient: {
        findMany: jest.fn().mockResolvedValue([
          { clientId: 'inite-estate', backchannelLogoutUri: null, firstParty: true, isPublic: false, redirectUris: ['https://inite.estate/callback'] },
          { clientId: 'dcr_x', backchannelLogoutUri: null, firstParty: false, isPublic: false, redirectUris: ['https://x.example/cb'] },
        ]),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (global as typeof globalThis & { fetch?: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    const svc = new BackchannelLogoutService(
      prisma as unknown as PrismaService,
      { sign: jest.fn().mockReturnValue('t') } as unknown as JwtService,
      { get: jest.fn().mockReturnValue('https://auth-api.inite.ai') } as unknown as ConfigService,
    );
    expect(await svc.fanOut({ userDid: 'did:k:1' })).toBe(1);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['https://inite.estate/api/auth/backchannel-logout']);
    const where = prisma.oAuthClient.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ NOT: { backchannelLogoutUri: null } }, { firstParty: true, isPublic: false }]);
    delete (global as { fetch?: unknown }).fetch;
  });
});
