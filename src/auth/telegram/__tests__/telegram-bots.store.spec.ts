import { LoggerService } from '../../../common/logger.service';
import { TelegramBotsStore, tokenEnvKey } from '../telegram-bots.store';
import { BOTS_ENV, fakeConfig } from './telegram-harness';
import { BOT_A_TOKEN } from './telegram-fixtures';

afterEach(() => jest.restoreAllMocks());

describe('Telegram bots config', () => {
  it('binds each bot to its clients, with its token from its own env key', () => {
    const store = new TelegramBotsStore(fakeConfig(BOTS_ENV));
    expect(store.forClient('smart-chat').map((b) => b.name)).toEqual(['break3']);
    expect(store.forClient('inite-shop').map((b) => b.name)).toEqual(['shop']);
    expect(store.forClient('inite-estate')).toEqual([]);
    expect(store.byName('shop')).toMatchObject({ username: 'inite_shop_bot', botId: '111111' });
    expect(tokenEnvKey('break-3')).toBe('TELEGRAM_BOT_TOKEN_BREAK_3');
  });

  it('skips a bot without a token or clients, and never logs a token', () => {
    const warn = jest.spyOn(LoggerService.prototype, 'warn').mockImplementation(() => undefined);
    const env = {
      TELEGRAM_BOTS: JSON.stringify([
        { name: 'shop', username: 'inite_shop_bot', clients: [] },
        { name: 'food', username: 'inite_food_bot', clients: ['inite-food'] },
        { name: 'bad', username: 'inite_bad_bot', clients: ['x'] },
      ]),
      TELEGRAM_BOT_TOKEN_SHOP: BOT_A_TOKEN,
      TELEGRAM_BOT_TOKEN_BAD: 'not-a-token',
    };
    expect(new TelegramBotsStore(fakeConfig(env)).all()).toEqual([]);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(BOT_A_TOKEN);
    expect(logged).not.toContain('not-a-token');
    expect(logged).toContain('TELEGRAM_BOT_TOKEN_FOOD');
  });

  it('treats unset or broken TELEGRAM_BOTS as no bots', () => {
    jest.spyOn(LoggerService.prototype, 'warn').mockImplementation(() => undefined);
    expect(new TelegramBotsStore(fakeConfig({})).all()).toEqual([]);
    expect(new TelegramBotsStore(fakeConfig({ TELEGRAM_BOTS: '{' })).all()).toEqual([]);
  });
});
