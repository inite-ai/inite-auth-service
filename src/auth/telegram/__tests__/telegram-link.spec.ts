import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OAuthClientRegistryService } from '../../../oauth/oauth-client-registry.service';
import { OAuthService } from '../../../oauth/oauth.service';
import { ConsentService } from '../../../oauth/consent.service';
import { StepUpService } from '../../../oauth/step-up.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../common/redis.service';
import { TelegramWebAppService } from '../telegram-webapp.service';
import { TelegramLinkService } from '../telegram-link.service';
import { TelegramLinkController, TELEGRAM_LINK_SCOPE } from '../telegram-link.controller';
import { AuthenticatedUser } from '../../authenticated-user';
import { makeTelegram } from './telegram-harness';
import { BOT_A_TOKEN, NOW, initDataFields, signInitData } from './telegram-fixtures';

const CLIENT = {
  clientId: 'inite-shop',
  redirectUris: ['https://shop.example/callback'],
  allowedGrants: ['authorization_code', 'refresh_token'],
  allowedScopes: ['openid', 'profile'],
};

function make() {
  const tg = makeTelegram();
  const links = new TelegramLinkService(
    tg.db.prisma as unknown as PrismaService,
    tg.redis as unknown as RedisService,
  );
  const oauth = {
    normalizeScope: jest.fn((s: string) => s || 'openid'),
    createAuthorizationCode: jest.fn(async () => 'the-code'),
  };
  const webApp = new TelegramWebAppService(
    tg.service,
    {
      validateClient: jest.fn(async () => CLIENT),
      validateRedirectUri: jest.fn(() => true),
      validateGrantType: jest.fn(),
    } as unknown as OAuthClientRegistryService,
    oauth as unknown as OAuthService,
    { isRequired: jest.fn(async () => false) } as unknown as ConsentService,
    new StepUpService(),
    links,
  );
  const controller = new TelegramLinkController(tg.service, links, tg.bots);
  // An INITE account that exists before any Telegram sign-in.
  const existing = { id: 'acc-1', did: 'did:web:auth:acc-1', email: 'ana@x.io', name: 'Ana' };
  tg.db.users.set(existing.id, existing);
  return { tg, links, webApp, controller, oauth, existing };
}

function body(initData: string, extra: Record<string, unknown> = {}) {
  return {
    init_data: initData,
    client_id: 'inite-shop',
    redirect_uri: 'https://shop.example/callback',
    code_challenge: 'c'.repeat(43),
    ...extra,
  };
}

const person = (userId: string): AuthenticatedUser => ({
  kind: 'user',
  userId,
  did: `did:web:auth:${userId}`,
  email: null,
  metadata: null,
  scope: new Set(),
});

const machine = (clientId: string, scopes: string[]): AuthenticatedUser => ({
  kind: 'machine',
  sub: clientId,
  clientId,
  audience: clientId,
  companyId: null,
  scope: new Set(scopes),
});

async function ticketFor(webApp: TelegramWebAppService, fields = initDataFields()) {
  try {
    await webApp.issueCode(body(signInitData(fields, BOT_A_TOKEN), { create_user: false }));
  } catch (err) {
    return (err as ConflictException).getResponse() as {
      error: string;
      link_ticket: string;
      telegram: { id: string; username: string };
    };
  }
  throw new Error('expected telegram_not_linked');
}

beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000));
afterEach(() => jest.restoreAllMocks());

/**
 * A Mini App that serves only existing accounts asks auth not to open one:
 * an unlinked Telegram user gets a ticket, the person signs in on the web and
 * the product redeems the ticket with their token. Neither proof is the
 * product's own.
 */
describe('Telegram link tickets', () => {
  it('create_user false: no account and no code for an unlinked Telegram user, a ticket instead', async () => {
    const { webApp, oauth, tg } = make();
    const answer = await ticketFor(webApp);
    expect(answer.error).toBe('telegram_not_linked');
    expect(answer.link_ticket).toMatch(/^[\w-]{40,}$/);
    expect(answer.telegram).toMatchObject({ id: '424242', username: 'ana_s' });
    expect(tg.db.identities).toHaveLength(0);
    expect(tg.db.identityService.createIdentity).not.toHaveBeenCalled();
    expect(oauth.createAuthorizationCode).not.toHaveBeenCalled();
  });

  it('the ticket links the Telegram user to the signed-in person, and the next open signs them in', async () => {
    const { webApp, controller, oauth, existing } = make();
    const { link_ticket } = await ticketFor(webApp);

    const out = await controller.link(person(existing.id), { ticket: link_ticket });
    expect(out).toEqual({
      telegram: { id: '424242', username: 'ana_s', first_name: 'Ana' },
      outcome: 'created',
    });

    const res = await webApp.issueCode(
      body(signInitData(initDataFields({ auth_date: String(NOW - 30) }), BOT_A_TOKEN), {
        create_user: false,
      }),
    );
    expect(res).toMatchObject({ code: 'the-code', is_new_user: false });
    expect(oauth.createAuthorizationCode).toHaveBeenCalledWith(
      expect.objectContaining({ userId: existing.id }),
    );
  });

  it('a ticket works once', async () => {
    const { webApp, controller, existing } = make();
    const { link_ticket } = await ticketFor(webApp);
    await controller.link(person(existing.id), { ticket: link_ticket });
    await expect(
      controller.link(person(existing.id), { ticket: link_ticket }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a made-up ticket links nothing', async () => {
    const { controller, existing, tg } = make();
    await expect(
      controller.link(person(existing.id), { ticket: 'not-a-ticket' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tg.db.identities).toHaveLength(0);
  });

  it('a machine token cannot redeem a ticket', async () => {
    const { webApp, controller } = make();
    const { link_ticket } = await ticketFor(webApp);
    await expect(
      controller.link(machine('inite-shop', [TELEGRAM_LINK_SCOPE]), { ticket: link_ticket }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a Telegram user linked to another account moves to the one confirming now', async () => {
    const { webApp, controller, tg, existing, links } = make();
    tg.db.users.set('acc-2', { id: 'acc-2', did: 'did:web:auth:acc-2', email: null, name: null });
    const first = await ticketFor(webApp);
    await controller.link(person('acc-2'), { ticket: first.link_ticket });

    const second = await ticketFor(
      webApp,
      initDataFields({ auth_date: String(NOW - 10), query_id: 'AAH-second' }),
    ).catch(() => null);
    // Linked now, so the second open is a sign-in, not a ticket.
    expect(second).toBeNull();

    // Another ticket for the same Telegram user, issued directly, moves it.
    const tgUser = {
      id: '424242',
      firstName: 'Ana',
      lastName: null,
      username: 'ana_s',
      photoUrl: null,
      languageCode: 'pt',
      authDate: NOW,
      hash: 'h',
    };
    const ticket = await links.issueTicket(tgUser, tg.bots.byName('shop')!, 'inite-shop');
    const moved = await controller.link(person(existing.id), { ticket });
    expect(moved.outcome).toBe('moved');
    expect(tg.db.identities[0]!.userId).toBe(existing.id);
  });

  it('the default still opens an account for a new Telegram user', async () => {
    const { webApp } = make();
    const res = await webApp.issueCode(body(signInitData(initDataFields(), BOT_A_TOKEN)));
    expect(res).toMatchObject({ code: 'the-code', is_new_user: true });
  });
});

/**
 * A first-party product carries over links it verified before auth knew
 * Telegram, so people who linked already keep their account. It never takes
 * a Telegram id away from someone else.
 */
describe('Telegram link import', () => {
  it('creates, keeps and reports, by DID or id', async () => {
    const { controller, tg, existing } = make();
    tg.db.users.set('acc-2', { id: 'acc-2', did: 'did:web:auth:acc-2', email: null, name: null });
    tg.db.identities.push({
      id: 'oi-x',
      userId: 'acc-2',
      provider: 'telegram',
      providerSubject: '777',
    });

    const out = await controller.importIdentities(machine('inite-shop', [TELEGRAM_LINK_SCOPE]), {
      links: [
        { user: existing.did, telegram_id: '424242' },
        { user: existing.did, telegram_id: '424242' },
        { user: existing.did, telegram_id: '777' },
        { user: 'did:web:auth:nobody', telegram_id: '1' },
        { user: 'not-an-id', telegram_id: '2' },
      ],
    });
    expect(out.results.map((r) => r.outcome)).toEqual([
      'created',
      'unchanged',
      'conflict',
      'no_user',
      'invalid',
    ]);
    expect(tg.db.identities.find((i) => i.providerSubject === '777')!.userId).toBe('acc-2');
  });

  it('needs the telegram:link scope on a machine token', async () => {
    const { controller, existing } = make();
    const links = [{ user: existing.did, telegram_id: '424242' }];
    await expect(
      controller.importIdentities(machine('inite-shop', []), { links }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.importIdentities(person(existing.id), { links }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a product that has no bot here', async () => {
    const { controller, existing, tg } = make();
    await expect(
      controller.importIdentities(machine('inite-food', [TELEGRAM_LINK_SCOPE]), {
        links: [{ user: existing.did, telegram_id: '424242' }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tg.db.identities).toHaveLength(0);
  });
});
