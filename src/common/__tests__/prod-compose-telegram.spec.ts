import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TelegramBotsStore } from '../../auth/telegram/telegram-bots.store';
import { fakeConfig } from '../../auth/telegram/__tests__/telegram-harness';
import { BOT_A_TOKEN, BOT_B_TOKEN } from '../../auth/telegram/__tests__/telegram-fixtures';

/**
 * Telegram sign-in on prod: which bot signs into which client is committed
 * in the prod compose file (not secret); the switch and each token come
 * from the deploy's .env (a repository variable and secrets). A token typed
 * into the file, or a bot list the store would skip, is caught here.
 */
describe('deploy/docker-compose.prod.yml: Telegram sign-in', () => {
  const text = readFileSync(join(__dirname, '../../../deploy/docker-compose.prod.yml'), 'utf8');
  const env = (key: string): string | undefined =>
    text.match(new RegExp(`^\\s*-\\s*'?${key}=(.*?)'?\\s*$`, 'm'))?.[1];

  it('is off unless the deploy turns it on', () => {
    expect(env('TELEGRAM_PROVIDER_ENABLED')).toBe('${TELEGRAM_PROVIDER_ENABLED:-false}');
  });

  it('binds @break3_bot to smart-chat and @floripa_ru_bot to floripa, and the store accepts both', () => {
    const bots = env('TELEGRAM_BOTS')!;
    expect(JSON.parse(bots).slice(0, 2)).toEqual([
      { name: 'break3', username: 'break3_bot', clients: ['smart-chat'] },
      { name: 'floripa', username: 'floripa_ru_bot', clients: ['floripa'] },
    ]);
    const store = new TelegramBotsStore(
      fakeConfig({
        TELEGRAM_BOTS: bots,
        TELEGRAM_BOT_TOKEN_BREAK3: BOT_A_TOKEN,
        TELEGRAM_BOT_TOKEN_FLORIPA: BOT_B_TOKEN,
      }),
    );
    expect(store.forClient('smart-chat').map((b) => b.username)).toEqual(['break3_bot']);
    // A bot signs only into its own client: floripa's bot cannot open smart-chat and back.
    expect(store.forClient('floripa').map((b) => b.username)).toEqual(['floripa_ru_bot']);
  });

  it("binds inite.ai's and inite.digital's bots, named by repository variables, and skips one not named yet", () => {
    const bots = env('TELEGRAM_BOTS')!;
    expect(JSON.parse(bots).slice(2)).toEqual([
      { name: 'initeai', username: '${TELEGRAM_BOT_USERNAME_INITEAI:-}', clients: ['inite-ai'] },
      {
        name: 'digital',
        username: '${TELEGRAM_BOT_USERNAME_DIGITAL:-}',
        clients: ['content-generator'],
      },
    ]);
    // What compose hands the container once the deploy wrote the variables.
    const named = (initeai: string, digital: string) =>
      bots
        .replace('${TELEGRAM_BOT_USERNAME_INITEAI:-}', initeai)
        .replace('${TELEGRAM_BOT_USERNAME_DIGITAL:-}', digital);
    const tokens = {
      TELEGRAM_BOT_TOKEN_BREAK3: BOT_A_TOKEN,
      TELEGRAM_BOT_TOKEN_FLORIPA: BOT_B_TOKEN,
      TELEGRAM_BOT_TOKEN_INITEAI: BOT_A_TOKEN,
      TELEGRAM_BOT_TOKEN_DIGITAL: BOT_B_TOKEN,
    };
    const both = new TelegramBotsStore(
      fakeConfig({ TELEGRAM_BOTS: named('inite_test_bot', 'digital_test_bot'), ...tokens }),
    );
    expect(both.forClient('inite-ai').map((b) => b.username)).toEqual(['inite_test_bot']);
    expect(both.forClient('content-generator').map((b) => b.username)).toEqual([
      'digital_test_bot',
    ]);
    const unnamed = new TelegramBotsStore(fakeConfig({ TELEGRAM_BOTS: named('', ''), ...tokens }));
    expect(unnamed.forClient('inite-ai')).toEqual([]);
    expect(unnamed.forClient('smart-chat').map((b) => b.username)).toEqual(['break3_bot']);
  });

  it('each bot token is interpolated from the deploy, never written in the file', () => {
    expect(env('TELEGRAM_BOT_TOKEN_BREAK3')).toBe('${TELEGRAM_BOT_TOKEN_BREAK3:-}');
    expect(env('TELEGRAM_BOT_TOKEN_FLORIPA')).toBe('${TELEGRAM_BOT_TOKEN_FLORIPA:-}');
    expect(env('TELEGRAM_BOT_TOKEN_INITEAI')).toBe('${TELEGRAM_BOT_TOKEN_INITEAI:-}');
    expect(env('TELEGRAM_BOT_TOKEN_DIGITAL')).toBe('${TELEGRAM_BOT_TOKEN_DIGITAL:-}');
    expect(text).not.toMatch(/TELEGRAM_BOT_TOKEN_\w+=\d+:/);
  });

  it('the deploy writes the switch from a variable and the token from the shared org secret', () => {
    const deploy = readFileSync(join(__dirname, '../../../.github/workflows/deploy.yml'), 'utf8');
    expect(deploy).toContain(
      "TELEGRAM_PROVIDER_ENABLED=${{ vars.TELEGRAM_PROVIDER_ENABLED || 'false' }}",
    );
    // One token, one place: the organization secret break3-backend reads too.
    expect(deploy).toContain('TELEGRAM_BOT_TOKEN_BREAK3=${{ secrets.BREAK3_TELEGRAM_BOT_TOKEN }}');
    expect(deploy).toContain(
      'TELEGRAM_BOT_TOKEN_FLORIPA=${{ secrets.FLORIPA_TELEGRAM_BOT_TOKEN }}',
    );
    expect(deploy).toContain(
      'TELEGRAM_BOT_TOKEN_INITEAI=${{ secrets.INITEAI_TELEGRAM_BOT_TOKEN }}',
    );
    expect(deploy).toContain(
      'TELEGRAM_BOT_TOKEN_DIGITAL=${{ secrets.DIGITAL_TELEGRAM_BOT_TOKEN }}',
    );
    expect(deploy).toContain(
      'TELEGRAM_BOT_USERNAME_INITEAI=${{ vars.INITEAI_TELEGRAM_BOT_USERNAME }}',
    );
    expect(deploy).toContain(
      'TELEGRAM_BOT_USERNAME_DIGITAL=${{ vars.DIGITAL_TELEGRAM_BOT_USERNAME }}',
    );
  });
});
