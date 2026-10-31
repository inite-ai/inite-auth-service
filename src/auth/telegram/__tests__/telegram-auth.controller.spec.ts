import { Request, Response } from 'express';
import { TelegramAuthController } from '../telegram-auth.controller';
import { TelegramWebAppService } from '../telegram-webapp.service';
import { fakeConfig, makeTelegram } from './telegram-harness';
import { BOT_A_TOKEN, NOW, signWidget, widgetFields } from './telegram-fixtures';

const ENV = {
  FRONTEND_URL: 'https://auth.example',
  FEDERATION_REDIRECT_BASE: 'https://auth.example',
  SESSION_SECRET: 'test-session-secret',
};

function fakeRes() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  };
}

function fakeReq(cookies: Record<string, string>) {
  const session = {
    id: 'sid-1',
    userId: undefined as string | undefined,
    amr: undefined as string[] | undefined,
    regenerate: (cb: (e?: unknown) => void) => cb(),
    save: (cb: (e?: unknown) => void) => cb(),
  };
  return { cookies, session };
}

beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000));
afterEach(() => jest.restoreAllMocks());

/**
 * The widget round-trip ends where a Google sign-in does: a first-party
 * session and /login with the authorize params, which resumes /authorize.
 */
describe('Telegram widget endpoints', () => {
  function make() {
    const tg = makeTelegram();
    const controller = new TelegramAuthController(
      tg.service,
      {} as TelegramWebAppService,
      fakeConfig(ENV),
    );
    return { controller, tg };
  }

  it('start hands the widget its bot and a callback carrying the state cookie value', async () => {
    const { controller } = make();
    const res = fakeRes();
    const out = await controller.start(
      { bot: 'shop', client_id: 'inite-shop', redirect_uri: 'https://shop.example/cb' },
      res as unknown as Response,
    );
    const state = res.cookie.mock.calls[0][1] as string;
    expect(res.cookie).toHaveBeenCalledWith(
      'inite.tg_state',
      state,
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax' }),
    );
    expect(out.bot_username).toBe('inite_shop_bot');
    expect(new URL(out.auth_url).searchParams.get('tg_state')).toBe(state);
    expect(JSON.stringify(out)).not.toContain(BOT_A_TOKEN);
  });

  it('callback sets the session and resumes the authorize flow at /login', async () => {
    const { controller } = make();
    const startRes = fakeRes();
    await controller.start(
      { bot: 'shop', client_id: 'inite-shop', state: 'rp-state' },
      startRes as unknown as Response,
    );
    const state = startRes.cookie.mock.calls[0][1] as string;
    const req = fakeReq({ 'inite.tg_state': state });
    const res = fakeRes();

    await controller.callback(
      { ...signWidget(widgetFields(), BOT_A_TOKEN), tg_state: state },
      req as unknown as Request,
      res as unknown as Response,
    );

    expect(req.session.userId).toBe('u1');
    expect(req.session.amr).toEqual(['federated']);
    expect(res.cookie).toHaveBeenCalledWith('inite.sid', expect.any(String), expect.any(Object));
    const to = new URL(res.redirect.mock.calls[0][0] as string);
    expect(to.pathname).toBe('/login');
    expect(to.searchParams.get('client_id')).toBe('inite-shop');
    expect(to.searchParams.get('state')).toBe('rp-state');
  });

  it('callback with a bad payload sets no session and lands on /login with an error', async () => {
    const { controller } = make();
    const req = fakeReq({ 'inite.tg_state': 'x' });
    const res = fakeRes();
    await controller.callback(
      { ...widgetFields(), hash: 'f'.repeat(64), tg_state: 'x' },
      req as unknown as Request,
      res as unknown as Response,
    );
    expect(req.session.userId).toBeUndefined();
    expect(res.redirect).toHaveBeenCalledWith(
      'https://auth.example/login?federation_error=telegram_failed',
    );
  });
});
