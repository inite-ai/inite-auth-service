import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TelegramBotsStore } from '../../auth/telegram/telegram-bots.store';
import { fakeConfig } from '../../auth/telegram/__tests__/telegram-harness';
import { BOT_A_TOKEN } from '../../auth/telegram/__tests__/telegram-fixtures';

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

  it("binds @break3_bot to smart-chat, Break3's client, and the store accepts it", () => {
    const bots = env('TELEGRAM_BOTS')!;
    expect(JSON.parse(bots)).toEqual([
      { name: 'break3', username: 'break3_bot', clients: ['smart-chat'] },
    ]);
    const store = new TelegramBotsStore(
      fakeConfig({ TELEGRAM_BOTS: bots, TELEGRAM_BOT_TOKEN_BREAK3: BOT_A_TOKEN }),
    );
    expect(store.forClient('smart-chat').map((b) => b.username)).toEqual(['break3_bot']);
  });

  it('each bot token is interpolated from the deploy, never written in the file', () => {
    expect(env('TELEGRAM_BOT_TOKEN_BREAK3')).toBe('${TELEGRAM_BOT_TOKEN_BREAK3:-}');
    expect(text).not.toMatch(/TELEGRAM_BOT_TOKEN_\w+=\d+:/);
  });

  it('the deploy writes the switch from a variable and the token from a secret', () => {
    const deploy = readFileSync(join(__dirname, '../../../.github/workflows/deploy.yml'), 'utf8');
    expect(deploy).toContain(
      "TELEGRAM_PROVIDER_ENABLED=${{ vars.TELEGRAM_PROVIDER_ENABLED || 'false' }}",
    );
    expect(deploy).toContain('TELEGRAM_BOT_TOKEN_BREAK3=${{ secrets.TELEGRAM_BOT_TOKEN_BREAK3 }}');
  });
});
