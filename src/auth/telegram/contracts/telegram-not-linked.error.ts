import type { TelegramUser } from './telegram-user';
import type { TelegramBot } from './telegram-bot';

/**
 * A verified Telegram user that no INITE account is linked to, met on a path
 * that must not open one. Not a refusal of the payload: the caller turns it
 * into a link ticket, so the person can attach this Telegram to their account.
 */
export class TelegramNotLinkedError extends Error {
  constructor(
    public readonly telegramUser: TelegramUser,
    public readonly bot: TelegramBot,
  ) {
    super('Telegram user is not linked to an INITE account');
    this.name = 'TelegramNotLinkedError';
  }
}
