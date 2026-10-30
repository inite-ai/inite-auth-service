import * as crypto from 'crypto';

/**
 * Test-side signing, written from Telegram's documentation rather than from
 * the code under test, so a mistake in one does not hide in the other.
 * Tokens are obvious dummies.
 */
export const BOT_A_TOKEN = '111111:test_dummy_token_bot_a_xxxxxxxx';
export const BOT_B_TOKEN = '222222:test_dummy_token_bot_b_xxxxxxxx';
export const NOW = 1_800_000_000;

function checkString(fields: Record<string, string>): string {
  return Object.entries(fields)
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

/** Login Widget: secret = SHA256(token). */
export function signWidget(fields: Record<string, string>, token: string): Record<string, string> {
  const secret = crypto.createHash('sha256').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(checkString(fields)).digest('hex');
  return { ...fields, hash };
}

export function widgetFields(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    id: '424242',
    first_name: 'Ana',
    last_name: 'Silva',
    username: 'ana_s',
    photo_url: 'https://t.me/i/userpic/320/ana.jpg',
    auth_date: String(NOW - 60),
    ...overrides,
  };
}

/** Mini App: secret = HMAC_SHA256(key "WebAppData", token); returns the raw initData. */
export function signInitData(fields: Record<string, string>, token: string): string {
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(checkString(fields)).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

export function initDataFields(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    query_id: 'AAH-test-query',
    user: JSON.stringify({
      id: 424242,
      first_name: 'Ana',
      last_name: 'Silva',
      username: 'ana_s',
      language_code: 'pt',
    }),
    auth_date: String(NOW - 60),
    ...overrides,
  };
}
