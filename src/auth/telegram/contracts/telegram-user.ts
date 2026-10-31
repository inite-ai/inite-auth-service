/**
 * A Telegram user out of a verified payload. `id` is the stable identity (the
 * `providerSubject` of the `telegram` OAuthIdentity); `username` is display
 * data only, since a Telegram username can be changed and then taken by
 * someone else.
 */
export interface TelegramUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  languageCode: string | null;
  /** `auth_date` of the payload, unix seconds. */
  authDate: number;
  /** The payload's hash, the key of the one-use record. */
  hash: string;
}
