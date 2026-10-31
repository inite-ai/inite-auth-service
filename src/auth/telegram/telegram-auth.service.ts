import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { RedisService } from '../../common/redis.service';
import { SettingsService } from '../../common/settings/settings.service';
import { LoggerService } from '../../common/logger.service';
import { FederationService } from '../federation/federation.service';
import { FederationResult } from '../federation/contracts/federation-result';
import { NormalizedProfile } from '../federation/contracts/normalized-profile';
import { TelegramBotsStore } from './telegram-bots.store';
import { TelegramAuthError } from './contracts/telegram-auth.error';
import { TelegramUser } from './contracts/telegram-user';
import { TelegramBot, TelegramWidgetState } from './contracts/telegram-bot';
import { verifyLoginWidget, verifyWebAppInitData } from './telegram-signature';

export const TELEGRAM_PROVIDER = 'telegram';
const DEFAULT_MAX_AGE = '1d';
const STATE_TTL_SECONDS = 600;
const STATE_KEY = (state: string) => `telegram:state:${state}`;
const USED_KEY = (bot: string, hash: string) => `telegram:used:${bot}:${hash}`;

/** '10m' / '1h' / '1d' / '3600' → seconds (the settings registry's duration shape). */
export function durationSeconds(value: string, fallback: number): number {
  const m = /^(\d+)([smhd]?)$/.exec(value.trim());
  if (!m) return fallback;
  const unit = { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2] as '' | 's' | 'm' | 'h' | 'd'];
  return parseInt(m[1]!, 10) * unit;
}

/**
 * Telegram as a sign-in provider. A verified Telegram user is resolved to an
 * INITE user through the same `OAuthIdentity` linking social federation uses
 * (provider `telegram`, subject = the numeric Telegram id), so a Telegram
 * sign-in ends in the ordinary session → /authorize → code → token flow and
 * an ordinary INITE token. Nothing about the token knows it was Telegram
 * beyond `amr: ["federated"]`, as with Google or GitHub.
 */
@Injectable()
export class TelegramAuthService {
  private readonly logger = new LoggerService();

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly settings: SettingsService,
    private readonly redis: RedisService,
    private readonly bots: TelegramBotsStore,
    private readonly federation: FederationService,
  ) {
    this.logger.setContext('TelegramAuthService');
  }

  /** Off (the default) answers 404, so a disabled provider cannot be probed. */
  assertEnabled(): void {
    if (!this.settings.flag('TELEGRAM_PROVIDER_ENABLED')) {
      throw new NotFoundException('Telegram sign-in is not enabled');
    }
  }

  maxAgeSeconds(): number {
    const raw = this.settings.value('TELEGRAM_AUTH_MAX_AGE', DEFAULT_MAX_AGE);
    return durationSeconds(raw, 86400);
  }

  /**
   * Begin a Login Widget sign-in for an /authorize in flight: the bot must be
   * bound to the client. Returns what the login page needs to render the
   * widget and the one-use state its callback must bring back.
   */
  async startWidget(
    botName: string,
    oauthParams: Record<string, string>,
  ): Promise<{ state: string; bot: TelegramBot }> {
    this.assertEnabled();
    const bot = this.bots.byName(botName);
    if (!bot) throw new TelegramAuthError('unknown_bot');
    const clientId = oauthParams.client_id;
    if (!clientId || !bot.clients.includes(clientId)) {
      throw new TelegramAuthError('bot_not_bound');
    }
    const state = crypto.randomBytes(32).toString('base64url');
    const data: TelegramWidgetState = { bot: bot.name, clientId, oauthParams };
    await this.redis.set(STATE_KEY(state), JSON.stringify(data), STATE_TTL_SECONDS);
    return { state, bot };
  }

  /**
   * The widget's redirect: `query` is Telegram's fields plus our `tg_state`.
   * The state must be the one this browser was given at /start (the cookie),
   * which stops a link carrying someone else's signed payload from signing
   * the victim into the sender's account.
   */
  async completeWidget(
    query: Record<string, unknown>,
    browserState: string | undefined,
  ): Promise<FederationResult> {
    this.assertEnabled();
    const { tg_state: state, ...rest } = query;
    if (typeof state !== 'string' || !state || !browserState || !sameText(state, browserState)) {
      throw new TelegramAuthError('state_mismatch');
    }
    const raw = await this.redis.getDel(STATE_KEY(state));
    if (!raw) throw new TelegramAuthError('state_mismatch');
    const saved = JSON.parse(raw) as TelegramWidgetState;
    const bot = this.bots.byName(saved.bot);
    if (!bot || !bot.clients.includes(saved.clientId)) throw new TelegramAuthError('bot_not_bound');

    const tgUser = verifyLoginWidget(stringFields(rest), bot.token, {
      maxAgeSeconds: this.maxAgeSeconds(),
    });
    const { user, isNewUser } = await this.signIn(tgUser, bot);
    return { user, isNewUser, returnTo: '', oauthParams: saved.oauthParams };
  }

  /**
   * Verify Mini App initData for a client: only the bots bound to that client
   * are tried, so initData signed by another product's bot is refused.
   */
  async verifyWebApp(
    initData: string,
    clientId: string,
  ): Promise<{ user: FederationResult['user']; isNewUser: boolean; bot: TelegramBot }> {
    this.assertEnabled();
    const bound = this.bots.forClient(clientId);
    if (bound.length === 0) throw new TelegramAuthError('bot_not_bound');
    const opts = { maxAgeSeconds: this.maxAgeSeconds() };
    let lastError: TelegramAuthError = new TelegramAuthError('bad_signature');
    for (const bot of bound) {
      try {
        const tgUser = verifyWebAppInitData(initData, bot.token, opts);
        return { ...(await this.signIn(tgUser, bot)), bot };
      } catch (err) {
        if (!(err instanceof TelegramAuthError)) throw err;
        // A signature that is not this bot's says nothing yet; a valid
        // signature that is stale or replayed is the answer.
        if (err.reason !== 'bad_signature') throw err;
        lastError = err;
      }
    }
    throw lastError;
  }

  /** One use per payload, then link or create the INITE user. */
  private async signIn(
    tgUser: TelegramUser,
    bot: TelegramBot,
  ): Promise<{ user: FederationResult['user']; isNewUser: boolean }> {
    const fresh = await this.redis.setIfAbsent(
      USED_KEY(bot.name, tgUser.hash),
      '1',
      this.maxAgeSeconds() + 120,
    );
    if (!fresh) throw new TelegramAuthError('replayed');
    const result = await this.federation.resolveUser(toProfile(tgUser, bot));
    this.logger.auth('Telegram sign-in', {
      bot: bot.name,
      userId: result.user.id,
      isNewUser: result.isNewUser,
    });
    return result;
  }
}

/** Telegram's fields as strings; a repeated query key (an array) is refused. */
function stringFields(query: Record<string, unknown>): Record<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(query)) {
    if (typeof v !== 'string') throw new TelegramAuthError('malformed');
    out.set(k, v);
  }
  return Object.fromEntries(out);
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * The federation profile of a Telegram user. Telegram asserts no email, so
 * resolveUser never links by email: it finds the (telegram, id) identity or
 * creates a user without an email, as for a GitHub account with none public.
 */
export function toProfile(tgUser: TelegramUser, bot: TelegramBot): NormalizedProfile {
  const name = [tgUser.firstName, tgUser.lastName].filter(Boolean).join(' ');
  return {
    provider: TELEGRAM_PROVIDER,
    subject: tgUser.id,
    email: null,
    emailVerified: false,
    displayName: name || null,
    avatarUrl: tgUser.photoUrl?.startsWith('https://') ? tgUser.photoUrl : null,
    raw: {
      id: tgUser.id,
      username: tgUser.username,
      first_name: tgUser.firstName,
      last_name: tgUser.lastName,
      language_code: tgUser.languageCode,
      bot: bot.name,
    },
  };
}
