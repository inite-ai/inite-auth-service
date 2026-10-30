import { NotFoundException } from '@nestjs/common';
import { TelegramAuthError } from '../contracts/telegram-auth.error';
import { durationSeconds } from '../telegram-auth.service';
import { makeTelegram } from './telegram-harness';
import {
  BOT_A_TOKEN,
  BOT_B_TOKEN,
  NOW,
  initDataFields,
  signInitData,
  signWidget,
  widgetFields,
} from './telegram-fixtures';

const AUTHORIZE = {
  client_id: 'inite-shop',
  redirect_uri: 'https://shop.example/callback',
  code_challenge: 'x'.repeat(43),
  state: 'rp-state',
};

async function reasonOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof TelegramAuthError) return err.reason;
    throw err;
  }
  return 'accepted';
}

beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000));
afterEach(() => jest.restoreAllMocks());

/** TELEGRAM_PROVIDER_ENABLED defaults off: the whole surface 404s. */
describe('Telegram provider flag', () => {
  it('is off unless TELEGRAM_PROVIDER_ENABLED=true', async () => {
    const { service } = makeTelegram({ TELEGRAM_PROVIDER_ENABLED: undefined });
    await expect(service.startWidget('shop', AUTHORIZE)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.completeWidget({}, 's')).rejects.toBeInstanceOf(NotFoundException);
    const initData = signInitData(initDataFields(), BOT_A_TOKEN);
    await expect(service.verifyWebApp(initData, 'inite-shop')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reads the window from TELEGRAM_AUTH_MAX_AGE, default one day', () => {
    expect(makeTelegram().service.maxAgeSeconds()).toBe(86400);
    expect(makeTelegram({ TELEGRAM_AUTH_MAX_AGE: '1h' }).service.maxAgeSeconds()).toBe(3600);
    expect(durationSeconds('nonsense', 7)).toBe(7);
  });
});

describe('Telegram Login Widget sign-in', () => {
  async function started(service: ReturnType<typeof makeTelegram>['service']) {
    const { state } = await service.startWidget('shop', AUTHORIZE);
    return state;
  }

  it('signs in through the bot bound to the client and resumes the authorize params', async () => {
    const { service, db } = makeTelegram();
    const state = await started(service);
    const query = { ...signWidget(widgetFields(), BOT_A_TOKEN), tg_state: state };

    const result = await service.completeWidget(query, state);

    expect(result.isNewUser).toBe(true);
    expect(result.oauthParams).toEqual(AUTHORIZE);
    expect(db.identities).toEqual([
      expect.objectContaining({ provider: 'telegram', providerSubject: '424242' }),
    ]);
    // No email from Telegram: the user is created without one.
    expect(db.identityService.createIdentity).toHaveBeenCalledWith(undefined, 'Ana Silva');
  });

  it('refuses a bot not bound to the client at /start', async () => {
    const { service } = makeTelegram();
    expect(await reasonOf(service.startWidget('break3', AUTHORIZE))).toBe('bot_not_bound');
    expect(await reasonOf(service.startWidget('nope', AUTHORIZE))).toBe('unknown_bot');
    expect(await reasonOf(service.startWidget('shop', {}))).toBe('bot_not_bound');
  });

  it("refuses a payload signed by another bot than the state's", async () => {
    const { service } = makeTelegram();
    const state = await started(service);
    const query = { ...signWidget(widgetFields(), BOT_B_TOKEN), tg_state: state };
    expect(await reasonOf(service.completeWidget(query, state))).toBe('bad_signature');
  });

  it("refuses a callback whose state is not this browser's (login CSRF)", async () => {
    const { service } = makeTelegram();
    const state = await started(service);
    const query = { ...signWidget(widgetFields(), BOT_A_TOKEN), tg_state: state };
    expect(await reasonOf(service.completeWidget(query, undefined))).toBe('state_mismatch');
    expect(await reasonOf(service.completeWidget(query, 'another-state'))).toBe('state_mismatch');
  });

  it('uses a state once', async () => {
    const { service } = makeTelegram();
    const state = await started(service);
    await service.completeWidget(
      { ...signWidget(widgetFields(), BOT_A_TOKEN), tg_state: state },
      state,
    );
    const again = {
      ...signWidget(widgetFields({ auth_date: String(NOW - 5) }), BOT_A_TOKEN),
      tg_state: state,
    };
    expect(await reasonOf(service.completeWidget(again, state))).toBe('state_mismatch');
  });

  it('refuses a repeated query key', async () => {
    const { service } = makeTelegram();
    const state = await started(service);
    const query = { ...signWidget(widgetFields(), BOT_A_TOKEN), id: ['1', '2'], tg_state: state };
    expect(await reasonOf(service.completeWidget(query, state))).toBe('malformed');
  });
});

describe('Telegram Mini App sign-in', () => {
  it('verifies initData with the bot bound to the client', async () => {
    const { service } = makeTelegram();
    const res = await service.verifyWebApp(
      signInitData(initDataFields(), BOT_A_TOKEN),
      'inite-shop',
    );
    expect(res.bot.name).toBe('shop');
    expect(res.isNewUser).toBe(true);
  });

  it('refuses initData from a bot that is not bound to the client', async () => {
    const { service } = makeTelegram();
    // Signed by break3's bot, presented to the shop's client.
    const initData = signInitData(initDataFields(), BOT_B_TOKEN);
    expect(await reasonOf(service.verifyWebApp(initData, 'inite-shop'))).toBe('bad_signature');
    // A client no bot is bound to.
    expect(await reasonOf(service.verifyWebApp(initData, 'inite-estate'))).toBe('bot_not_bound');
  });

  it('refuses the same initData twice, and stale initData', async () => {
    const { service } = makeTelegram();
    const initData = signInitData(initDataFields(), BOT_A_TOKEN);
    await service.verifyWebApp(initData, 'inite-shop');
    expect(await reasonOf(service.verifyWebApp(initData, 'inite-shop'))).toBe('replayed');

    const old = signInitData(initDataFields({ auth_date: String(NOW - 86401) }), BOT_A_TOKEN);
    expect(await reasonOf(service.verifyWebApp(old, 'inite-shop'))).toBe('stale');
  });
});

/** One Telegram account is one INITE user, whichever bot or flow it came through. */
describe('Telegram account linking', () => {
  it('creates the user once and reuses it on the next sign-in', async () => {
    const { service, db } = makeTelegram();
    const first = await service.verifyWebApp(
      signInitData(initDataFields(), BOT_A_TOKEN),
      'inite-shop',
    );

    const state = (await service.startWidget('shop', AUTHORIZE)).state;
    const widget = signWidget(widgetFields({ auth_date: String(NOW - 30) }), BOT_A_TOKEN);
    const second = await service.completeWidget({ ...widget, tg_state: state }, state);

    expect(first.isNewUser).toBe(true);
    expect(second.isNewUser).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(db.identityService.createIdentity).toHaveBeenCalledTimes(1);
    expect(db.identities).toHaveLength(1);
  });

  it('keys on the Telegram id, never the username', async () => {
    const { service, db } = makeTelegram();
    await service.verifyWebApp(signInitData(initDataFields(), BOT_A_TOKEN), 'inite-shop');
    // Someone else who took the username "ana_s" later is another person.
    const other = initDataFields({
      user: JSON.stringify({ id: 777, first_name: 'Eve', username: 'ana_s' }),
    });
    const res = await service.verifyWebApp(signInitData(other, BOT_A_TOKEN), 'inite-shop');
    expect(res.isNewUser).toBe(true);
    expect(db.users.size).toBe(2);
  });
});
