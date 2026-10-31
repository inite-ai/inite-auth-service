import * as crypto from 'crypto';
import { TelegramAuthError } from './contracts/telegram-auth.error';
import { TelegramUser } from './contracts/telegram-user';

/**
 * Telegram's two signed sign-in payloads, verified with a bot's token.
 *
 * Login Widget (https://core.telegram.org/widgets/login#checking-authorization):
 *   secret = SHA256(bot_token), hash = hex(HMAC_SHA256(secret, data_check_string)).
 * Mini App initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 *   secret = HMAC_SHA256(key = "WebAppData", bot_token), hash = hex(HMAC_SHA256(secret, data_check_string)).
 *
 * data_check_string is every received field except `hash`, as `key=value`,
 * sorted by key, joined by "\n". Both are pure functions so the security
 * properties are tested without Nest, Redis or a database.
 */

export interface FreshnessOptions {
  /** Oldest accepted `auth_date`, in seconds. */
  maxAgeSeconds: number;
  /** Clock, in unix seconds (tests pin it). */
  nowSeconds?: number;
}

/** A payload signed a little in the future is clock skew; much more is forged. */
const FUTURE_SKEW_SECONDS = 60;
const HASH_HEX = /^[0-9a-f]{64}$/;

/** `key=value` lines sorted by key, without `hash` (Telegram's data_check_string). */
export function dataCheckString(fields: Record<string, string>): string {
  return Object.keys(fields)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
}

/**
 * Constant-time hash comparison. A plain `!==` leaks, byte by byte, how much
 * of a forged hash is right; several products compared that way before
 * Telegram sign-in moved here.
 */
export function hashesMatch(expectedHex: string, receivedHex: string): boolean {
  if (!HASH_HEX.test(receivedHex)) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const received = Buffer.from(receivedHex, 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function hmacHex(secret: Buffer, data: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function widgetSecret(botToken: string): Buffer {
  return crypto.createHash('sha256').update(botToken).digest();
}

function webAppSecret(botToken: string): Buffer {
  return crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
}

/** `auth_date` within the window; a stale or far-future one is refused. */
export function assertFresh(authDate: string | undefined, opts: FreshnessOptions): number {
  if (!authDate || !/^\d{1,12}$/.test(authDate)) {
    throw new TelegramAuthError('missing_auth_date');
  }
  const at = Number(authDate);
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (at > now + FUTURE_SKEW_SECONDS) throw new TelegramAuthError('auth_date_in_future');
  if (now - at > opts.maxAgeSeconds) throw new TelegramAuthError('stale');
  return at;
}

function requireHash(fields: Record<string, string>): string {
  const hash = fields.hash;
  if (!hash) throw new TelegramAuthError('missing_hash');
  return hash.toLowerCase();
}

/**
 * Verify Login Widget fields (the query Telegram appends to `data-auth-url`,
 * or the object its JS callback receives). `fields` must hold only Telegram's
 * fields: the caller strips its own parameters (our `tg_state`) first, because
 * an extra key changes the data_check_string.
 */
export function verifyLoginWidget(
  fields: Record<string, string>,
  botToken: string,
  opts: FreshnessOptions,
): TelegramUser {
  const hash = requireHash(fields);
  const expected = hmacHex(widgetSecret(botToken), dataCheckString(fields));
  if (!hashesMatch(expected, hash)) throw new TelegramAuthError('bad_signature');
  const authDate = assertFresh(fields.auth_date, opts);
  if (!fields.id || !/^\d{1,20}$/.test(fields.id)) throw new TelegramAuthError('missing_user');
  return {
    id: fields.id,
    firstName: fields.first_name ?? null,
    lastName: fields.last_name ?? null,
    username: fields.username ?? null,
    photoUrl: fields.photo_url ?? null,
    languageCode: null,
    authDate,
    hash,
  };
}

/** initData as a flat map; a repeated key is refused rather than guessed at. */
export function parseInitData(initData: string): Record<string, string> {
  // A Map, then fromEntries: a key such as __proto__ cannot reach a prototype.
  const fields = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(initData)) {
    if (fields.has(key)) throw new TelegramAuthError('malformed');
    fields.set(key, value);
  }
  return Object.fromEntries(fields);
}

function parseWebAppUser(raw: string | undefined): Record<string, unknown> {
  if (!raw) throw new TelegramAuthError('missing_user');
  let user: unknown;
  try {
    user = JSON.parse(raw);
  } catch {
    throw new TelegramAuthError('malformed');
  }
  const id = (user as { id?: unknown } | null)?.id;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new TelegramAuthError('missing_user');
  }
  return user as Record<string, unknown>;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Verify a Mini App's `Telegram.WebApp.initData` (the raw query string, not
 * initDataUnsafe) and return its `user`. The signature is checked before the
 * user JSON is trusted for anything.
 */
export function verifyWebAppInitData(
  initData: string,
  botToken: string,
  opts: FreshnessOptions,
): TelegramUser {
  const fields = parseInitData(initData);
  const hash = requireHash(fields);
  const expected = hmacHex(webAppSecret(botToken), dataCheckString(fields));
  if (!hashesMatch(expected, hash)) throw new TelegramAuthError('bad_signature');
  const authDate = assertFresh(fields.auth_date, opts);
  const user = parseWebAppUser(fields.user);
  return {
    id: String(user.id),
    firstName: str(user.first_name),
    lastName: str(user.last_name),
    username: str(user.username),
    photoUrl: str(user.photo_url),
    languageCode: str(user.language_code),
    authDate,
    hash,
  };
}
