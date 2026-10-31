/**
 * Why a Telegram sign-in payload was refused. The reason is a fixed code, safe
 * to log and to return: it never carries the payload, the hash or a token.
 */
export type TelegramAuthReason =
  | 'missing_hash'
  | 'bad_signature'
  | 'missing_auth_date'
  | 'stale'
  | 'auth_date_in_future'
  | 'missing_user'
  | 'malformed'
  | 'replayed'
  | 'unknown_bot'
  | 'bot_not_bound'
  | 'state_mismatch';

export class TelegramAuthError extends Error {
  constructor(public readonly reason: TelegramAuthReason) {
    super(`Telegram sign-in refused: ${reason}`);
    this.name = 'TelegramAuthError';
  }
}
