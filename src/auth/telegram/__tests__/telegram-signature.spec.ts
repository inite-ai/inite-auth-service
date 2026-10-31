import * as crypto from 'crypto';

// The real comparison, wrapped so the test can see it is the one used
// (a namespace import's properties cannot be spied on directly).
jest.mock('crypto', () => {
  const actual = jest.requireActual<typeof import('crypto')>('crypto');
  return { ...actual, timingSafeEqual: jest.fn(actual.timingSafeEqual) };
});

import {
  dataCheckString,
  hashesMatch,
  parseInitData,
  verifyLoginWidget,
  verifyWebAppInitData,
} from '../telegram-signature';
import { TelegramAuthError } from '../contracts/telegram-auth.error';
import {
  BOT_A_TOKEN,
  BOT_B_TOKEN,
  NOW,
  initDataFields,
  signInitData,
  signWidget,
  widgetFields,
} from './telegram-fixtures';

const DAY = 86400;
const opts = { maxAgeSeconds: DAY, nowSeconds: NOW };

function reasonOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof TelegramAuthError) return err.reason;
    throw err;
  }
  return 'accepted';
}

/**
 * The Login Widget hash (https://core.telegram.org/widgets/login): before this
 * provider, products compared it with `!==` and one skipped it in dev.
 */
describe('Telegram Login Widget verification', () => {
  it('accepts a payload signed with the bot token and returns the user by id', () => {
    const user = verifyLoginWidget(signWidget(widgetFields(), BOT_A_TOKEN), BOT_A_TOKEN, opts);
    expect(user).toMatchObject({ id: '424242', firstName: 'Ana', username: 'ana_s' });
    expect(user.authDate).toBe(NOW - 60);
  });

  it('refuses a payload whose field was changed after signing', () => {
    const signed = signWidget(widgetFields(), BOT_A_TOKEN);
    expect(reasonOf(() => verifyLoginWidget({ ...signed, id: '1' }, BOT_A_TOKEN, opts))).toBe(
      'bad_signature',
    );
    // A username is display data, but it is signed too: changing it is tampering.
    expect(
      reasonOf(() => verifyLoginWidget({ ...signed, username: 'admin' }, BOT_A_TOKEN, opts)),
    ).toBe('bad_signature');
  });

  it('refuses an added field (it changes the data_check_string)', () => {
    const signed = signWidget(widgetFields(), BOT_A_TOKEN);
    expect(reasonOf(() => verifyLoginWidget({ ...signed, extra: 'x' }, BOT_A_TOKEN, opts))).toBe(
      'bad_signature',
    );
  });

  it("refuses a payload signed by another product's bot", () => {
    const signed = signWidget(widgetFields(), BOT_B_TOKEN);
    expect(reasonOf(() => verifyLoginWidget(signed, BOT_A_TOKEN, opts))).toBe('bad_signature');
  });

  it('refuses a stale auth_date and one far in the future', () => {
    const stale = signWidget(widgetFields({ auth_date: String(NOW - DAY - 1) }), BOT_A_TOKEN);
    expect(reasonOf(() => verifyLoginWidget(stale, BOT_A_TOKEN, opts))).toBe('stale');
    const future = signWidget(widgetFields({ auth_date: String(NOW + 3600) }), BOT_A_TOKEN);
    expect(reasonOf(() => verifyLoginWidget(future, BOT_A_TOKEN, opts))).toBe(
      'auth_date_in_future',
    );
  });

  it('honours a shorter configured window', () => {
    const hourOld = signWidget(widgetFields({ auth_date: String(NOW - 3601) }), BOT_A_TOKEN);
    expect(
      reasonOf(() =>
        verifyLoginWidget(hourOld, BOT_A_TOKEN, { maxAgeSeconds: 3600, nowSeconds: NOW }),
      ),
    ).toBe('stale');
  });

  it('refuses a payload without a hash, or with an empty one', () => {
    expect(reasonOf(() => verifyLoginWidget(widgetFields(), BOT_A_TOKEN, opts))).toBe(
      'missing_hash',
    );
    expect(
      reasonOf(() => verifyLoginWidget({ ...widgetFields(), hash: '' }, BOT_A_TOKEN, opts)),
    ).toBe('missing_hash');
  });

  it('refuses a signed payload with no auth_date', () => {
    const fields = widgetFields();
    delete (fields as Record<string, string | undefined>).auth_date;
    expect(
      reasonOf(() => verifyLoginWidget(signWidget(fields, BOT_A_TOKEN), BOT_A_TOKEN, opts)),
    ).toBe('missing_auth_date');
  });
});

describe('Telegram Mini App initData verification', () => {
  it('accepts initData signed with the WebAppData-derived secret and parses user', () => {
    const user = verifyWebAppInitData(
      signInitData(initDataFields(), BOT_A_TOKEN),
      BOT_A_TOKEN,
      opts,
    );
    expect(user).toMatchObject({ id: '424242', firstName: 'Ana', languageCode: 'pt' });
  });

  it('is not the widget scheme: a widget-style signature over initData fails', () => {
    // Same fields, widget secret (SHA256(token)) instead of HMAC("WebAppData", token).
    const widgetSigned = signWidget(initDataFields(), BOT_A_TOKEN);
    const initData = new URLSearchParams(widgetSigned).toString();
    expect(reasonOf(() => verifyWebAppInitData(initData, BOT_A_TOKEN, opts))).toBe('bad_signature');
  });

  it('refuses initData signed by a bot other than the one it is checked against', () => {
    const initData = signInitData(initDataFields(), BOT_B_TOKEN);
    expect(reasonOf(() => verifyWebAppInitData(initData, BOT_A_TOKEN, opts))).toBe('bad_signature');
  });

  it('refuses a tampered user', () => {
    const params = new URLSearchParams(signInitData(initDataFields(), BOT_A_TOKEN));
    params.set('user', JSON.stringify({ id: 1, first_name: 'Ana' }));
    expect(reasonOf(() => verifyWebAppInitData(params.toString(), BOT_A_TOKEN, opts))).toBe(
      'bad_signature',
    );
  });

  it('refuses a replay outside the window, and missing hash', () => {
    const old = signInitData(initDataFields({ auth_date: String(NOW - DAY - 10) }), BOT_A_TOKEN);
    expect(reasonOf(() => verifyWebAppInitData(old, BOT_A_TOKEN, opts))).toBe('stale');
    const unsigned = new URLSearchParams(initDataFields()).toString();
    expect(reasonOf(() => verifyWebAppInitData(unsigned, BOT_A_TOKEN, opts))).toBe('missing_hash');
  });

  it('refuses a repeated key instead of picking one', () => {
    const initData = signInitData(initDataFields(), BOT_A_TOKEN) + '&auth_date=1';
    expect(reasonOf(() => parseInitData(initData))).toBe('malformed');
  });

  it('refuses a signed payload whose user has no numeric id', () => {
    const initData = signInitData(
      initDataFields({ user: JSON.stringify({ username: 'ana_s' }) }),
      BOT_A_TOKEN,
    );
    expect(reasonOf(() => verifyWebAppInitData(initData, BOT_A_TOKEN, opts))).toBe('missing_user');
  });
});

describe('Telegram hash comparison is constant-time', () => {
  const timingSafeEqual = crypto.timingSafeEqual as jest.MockedFunction<
    typeof crypto.timingSafeEqual
  >;
  beforeEach(() => timingSafeEqual.mockClear());

  it('goes through crypto.timingSafeEqual for both schemes', () => {
    const spy = timingSafeEqual;
    verifyLoginWidget(signWidget(widgetFields(), BOT_A_TOKEN), BOT_A_TOKEN, opts);
    expect(spy).toHaveBeenCalledTimes(1);
    reasonOf(() =>
      verifyWebAppInitData(signInitData(initDataFields(), BOT_B_TOKEN), BOT_A_TOKEN, opts),
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('refuses a non-hex or short hash before comparing', () => {
    const spy = timingSafeEqual;
    expect(hashesMatch('a'.repeat(64), 'zz')).toBe(false);
    expect(hashesMatch('a'.repeat(64), 'a'.repeat(63))).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('builds the data_check_string sorted by key, without hash', () => {
    expect(dataCheckString({ b: '2', hash: 'h', a: '1' })).toBe('a=1\nb=2');
  });
});
