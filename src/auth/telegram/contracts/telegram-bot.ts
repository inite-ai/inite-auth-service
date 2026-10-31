/**
 * A product's Telegram bot. `token` comes from its own env key and never
 * leaves the process: not logged, not returned, not in the settings API.
 */
export interface TelegramBot {
  /** Short name used in URLs and in the token's env key (`break3`). */
  name: string;
  /** The bot's @username, for the Login Widget's `data-telegram-login`. */
  username: string;
  /** Numeric bot id, the part of the token before the colon. */
  botId: string;
  token: string;
  /** OAuth client ids this bot may sign people into. */
  clients: string[];
}

/** Stashed between /start and the widget callback (Redis, 10 min). */
export interface TelegramWidgetState {
  bot: string;
  clientId: string;
  /** OAuth-continuation params of the /authorize that sent the person to /login. */
  oauthParams: Record<string, string>;
}
