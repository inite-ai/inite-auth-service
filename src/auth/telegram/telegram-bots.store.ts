import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../common/logger.service';
import { TelegramBot } from './contracts/telegram-bot';

const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const USERNAME = /^[A-Za-z0-9_]{5,64}$/;
/** `<numeric bot id>:<secret>`, the shape @BotFather hands out. */
const TOKEN = /^(\d{1,20}):[A-Za-z0-9_-]{20,}$/;

/** Env key holding a bot's token: `TELEGRAM_BOT_TOKEN_<NAME>`. */
export function tokenEnvKey(name: string): string {
  return `TELEGRAM_BOT_TOKEN_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

interface BotEntry {
  name?: unknown;
  username?: unknown;
  clients?: unknown;
}

/**
 * The family's Telegram bots and the clients each may sign into.
 *
 *   TELEGRAM_BOTS='[{"name":"break3","username":"break3_bot","clients":["smart-chat"]}]'
 *   TELEGRAM_BOT_TOKEN_BREAK3=<token from @BotFather>
 *
 * The binding is the point: a payload signed by bot X proves only that
 * Telegram showed it to X's users, so it may only sign into X's products. The
 * mapping is not secret; the tokens are, which is why each has its own env
 * key and none is in the settings registry. A bot whose entry or token is
 * malformed is left out with a warning that names the key, never the value.
 */
@Injectable()
export class TelegramBotsStore {
  private readonly logger = new LoggerService();
  private cache: TelegramBot[] | null = null;

  constructor(private readonly config: ConfigService) {
    this.logger.setContext('TelegramBotsStore');
  }

  all(): TelegramBot[] {
    this.cache ??= this.load();
    return this.cache;
  }

  byName(name: string): TelegramBot | undefined {
    return this.all().find((b) => b.name === name);
  }

  /** Bots bound to this client; a payload for the client must be signed by one of them. */
  forClient(clientId: string): TelegramBot[] {
    return this.all().filter((b) => b.clients.includes(clientId));
  }

  private load(): TelegramBot[] {
    const raw = this.config.get<string>('TELEGRAM_BOTS');
    if (!raw) return [];
    let entries: unknown;
    try {
      entries = JSON.parse(raw);
    } catch {
      this.logger.warn('TELEGRAM_BOTS is not valid JSON; no Telegram bot is configured');
      return [];
    }
    if (!Array.isArray(entries)) {
      this.logger.warn('TELEGRAM_BOTS must be a JSON array; no Telegram bot is configured');
      return [];
    }
    const bots: TelegramBot[] = [];
    for (const entry of entries as BotEntry[]) {
      const bot = this.toBot(entry);
      if (bot && !bots.some((b) => b.name === bot.name)) bots.push(bot);
    }
    return bots;
  }

  private toBot(entry: BotEntry): TelegramBot | null {
    const { name, username, clients } = entry ?? {};
    if (typeof name !== 'string' || !NAME.test(name)) {
      this.logger.warn('TELEGRAM_BOTS: an entry has no valid "name"; skipped');
      return null;
    }
    if (typeof username !== 'string' || !USERNAME.test(username.replace(/^@/, ''))) {
      this.logger.warn(`TELEGRAM_BOTS: bot "${name}" has no valid "username"; skipped`);
      return null;
    }
    const clientIds = Array.isArray(clients)
      ? clients.filter((c): c is string => typeof c === 'string' && c.length > 0)
      : [];
    if (clientIds.length === 0) {
      this.logger.warn(`TELEGRAM_BOTS: bot "${name}" is bound to no client; skipped`);
      return null;
    }
    const key = tokenEnvKey(name);
    const token = this.config.get<string>(key)?.trim() ?? '';
    const match = TOKEN.exec(token);
    if (!match) {
      this.logger.warn(`TELEGRAM_BOTS: ${key} is unset or not a bot token; bot "${name}" skipped`);
      return null;
    }
    return {
      name,
      username: username.replace(/^@/, ''),
      botId: match[1]!,
      token,
      clients: clientIds,
    };
  }
}
