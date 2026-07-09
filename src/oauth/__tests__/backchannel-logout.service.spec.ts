import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BackchannelLogoutService } from '../backchannel-logout.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('BackchannelLogoutService', () => {
  let svc: BackchannelLogoutService;
  let prisma: { oAuthClient: { findMany: jest.Mock } };
  let jwt: { sign: jest.Mock };
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    prisma = {
      oAuthClient: {
        findMany: jest.fn(),
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
});
