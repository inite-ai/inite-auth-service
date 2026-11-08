/**
 * The OAuthIdentity `provider` of a Telegram sign-in; its `providerSubject` is
 * the numeric Telegram user id. A leaf module, so the token issuer can read
 * Telegram identities without importing the sign-in service.
 */
export const TELEGRAM_PROVIDER = 'telegram';
