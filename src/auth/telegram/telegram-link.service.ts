import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis.service';
import { LoggerService } from '../../common/logger.service';
import { TelegramAuthError } from './contracts/telegram-auth.error';
import { TelegramUser } from './contracts/telegram-user';
import { TelegramBot } from './contracts/telegram-bot';
import { TELEGRAM_PROVIDER, toProfile } from './telegram-auth.service';

/** A link ticket lives as long as a person needs to sign in on the web and confirm. */
export const LINK_TICKET_TTL_SECONDS = 15 * 60;
const TICKET_KEY = (ticket: string) => `telegram:link:${ticket}`;

/** The most rows one import call may carry. */
export const IMPORT_MAX_ROWS = 500;

/** What a ticket holds: the verified Telegram user and the bot that vouched for them. */
interface LinkTicket {
  user: TelegramUser;
  bot: { name: string; username: string };
  clientId: string;
}

export type LinkOutcome = 'created' | 'unchanged' | 'moved';
export type ImportOutcome = 'created' | 'unchanged' | 'conflict' | 'no_user' | 'invalid';

/** Who a ticket names, for the confirming page: the numeric id and the @username, never only the name its owner typed. */
export interface TicketHolder {
  id: string;
  username: string | null;
  firstName: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TELEGRAM_ID = /^\d{1,20}$/;

/**
 * Attaching a Telegram user to an INITE account that already exists.
 *
 * Signing in through a Mini App opens an account for a Telegram user nobody
 * linked yet. A product whose Mini App serves only people who already have an
 * account (inite.ai's cabinet, inite.digital's operator app) asks instead for
 * a link ticket: auth verified the initData, so the ticket proves the
 * Telegram side; the person then signs in on the web, where the product calls
 * `redeem` with their access token, which proves the INITE side. Neither
 * proof is the product's own: no product checks a Telegram signature.
 *
 * `importLinks` carries over links a first-party product verified before
 * auth knew Telegram, so the people who linked already keep their account. It
 * never moves an identity that is linked to someone else.
 */
@Injectable()
export class TelegramLinkService {
  private readonly logger = new LoggerService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.logger.setContext('TelegramLinkService');
  }

  /** A one-use ticket naming a verified Telegram user, for `redeem`. */
  async issueTicket(user: TelegramUser, bot: TelegramBot, clientId: string): Promise<string> {
    const ticket = crypto.randomBytes(32).toString('base64url');
    const data: LinkTicket = {
      user,
      bot: { name: bot.name, username: bot.username },
      clientId,
    };
    await this.redis.set(TICKET_KEY(ticket), JSON.stringify(data), LINK_TICKET_TTL_SECONDS);
    return ticket;
  }

  /**
   * Link the ticket's Telegram user to this INITE user. A Telegram user
   * linked to another account moves here: both sides are proven at this
   * moment, and the newest confirmation is the one the person meant.
   */
  async redeem(
    ticket: string,
    userId: string,
  ): Promise<{ telegram: TicketHolder; outcome: LinkOutcome }> {
    const raw = ticket ? await this.redis.getDel(TICKET_KEY(ticket)) : null;
    if (!raw) throw new TelegramAuthError('ticket_invalid');
    const saved = JSON.parse(raw) as LinkTicket;
    const profile = toProfile(saved.user, {
      name: saved.bot.name,
      username: saved.bot.username,
      botId: '',
      token: '',
      clients: [saved.clientId],
    });
    const snapshot = {
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      profile: profile.raw as object,
    };

    const existing = await this.prisma.oAuthIdentity.findUnique({
      where: {
        provider_providerSubject: { provider: TELEGRAM_PROVIDER, providerSubject: saved.user.id },
      },
    });
    let outcome: LinkOutcome;
    if (!existing) {
      await this.prisma.oAuthIdentity.create({
        data: {
          userId,
          provider: TELEGRAM_PROVIDER,
          providerSubject: saved.user.id,
          email: null,
          emailVerified: false,
          ...snapshot,
        },
      });
      outcome = 'created';
    } else if (existing.userId === userId) {
      await this.prisma.oAuthIdentity.update({ where: { id: existing.id }, data: snapshot });
      outcome = 'unchanged';
    } else {
      await this.prisma.oAuthIdentity.update({
        where: { id: existing.id },
        data: { userId, ...snapshot },
      });
      outcome = 'moved';
    }
    this.logger.auth('Telegram linked by ticket', {
      bot: saved.bot.name,
      clientId: saved.clientId,
      userId,
      outcome,
      ...(outcome === 'moved' ? { fromUserId: existing!.userId } : {}),
    });
    return {
      telegram: {
        id: saved.user.id,
        username: saved.user.username,
        firstName: saved.user.firstName,
      },
      outcome,
    };
  }

  /**
   * Carry over links a first-party product verified itself. `user` is the
   * INITE user's DID (the token's `sub`) or its id. A Telegram id linked to
   * a different user is reported, never moved.
   */
  async importLinks(
    rows: Array<{ user: string; telegram_id: string }>,
    clientId: string,
  ): Promise<{ results: Array<{ user: string; telegram_id: string; outcome: ImportOutcome }> }> {
    const results: Array<{ user: string; telegram_id: string; outcome: ImportOutcome }> = [];
    for (const row of rows.slice(0, IMPORT_MAX_ROWS)) {
      results.push({ ...row, outcome: await this.importOne(row) });
    }
    const counts = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
      return acc;
    }, {});
    this.logger.auth('Telegram links imported', { clientId, ...counts });
    return { results };
  }

  private async importOne(row: { user: string; telegram_id: string }): Promise<ImportOutcome> {
    const telegramId = String(row.telegram_id ?? '');
    const ref = String(row.user ?? '');
    if (!TELEGRAM_ID.test(telegramId)) return 'invalid';
    const where = ref.startsWith('did:') ? { did: ref } : UUID.test(ref) ? { id: ref } : null;
    if (!where) return 'invalid';
    const user = await this.prisma.user.findUnique({ where, select: { id: true } });
    if (!user) return 'no_user';

    const existing = await this.prisma.oAuthIdentity.findUnique({
      where: {
        provider_providerSubject: { provider: TELEGRAM_PROVIDER, providerSubject: telegramId },
      },
    });
    if (existing) return existing.userId === user.id ? 'unchanged' : 'conflict';
    try {
      await this.prisma.oAuthIdentity.create({
        data: {
          userId: user.id,
          provider: TELEGRAM_PROVIDER,
          providerSubject: telegramId,
          email: null,
          emailVerified: false,
          profile: { imported: true },
        },
      });
    } catch (err) {
      // A sign-in linked this Telegram id between the read and the write.
      if ((err as { code?: string }).code === 'P2002') return 'conflict';
      throw err;
    }
    return 'created';
  }
}
