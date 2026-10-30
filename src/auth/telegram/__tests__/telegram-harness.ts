import { ConfigService } from '@nestjs/config';
import { FederationService } from '../../federation/federation.service';
import { FederationProviders } from '../../federation/federation-providers.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../common/redis.service';
import { IdentityService } from '../../../identity/identity.service';
import { fakeSettings } from '../../../common/settings/settings.test-fixture';
import { TelegramBotsStore } from '../telegram-bots.store';
import { TelegramAuthService } from '../telegram-auth.service';
import { BOT_A_TOKEN, BOT_B_TOKEN } from './telegram-fixtures';

/** Two products' bots: "shop" signs into inite-shop, "break3" into smart-chat. */
export const BOTS_ENV: Record<string, string> = {
  TELEGRAM_BOTS: JSON.stringify([
    { name: 'shop', username: 'inite_shop_bot', clients: ['inite-shop'] },
    { name: 'break3', username: 'break3_bot', clients: ['smart-chat', 'smart-chat-admin'] },
  ]),
  TELEGRAM_BOT_TOKEN_SHOP: BOT_A_TOKEN,
  TELEGRAM_BOT_TOKEN_BREAK3: BOT_B_TOKEN,
};

export function fakeConfig(env: Record<string, string | undefined>): ConfigService {
  return {
    get: (k: string, fallback?: unknown) => env[k] ?? fallback,
  } as unknown as ConfigService;
}

/** In-memory Redis with the three calls the provider makes. */
export function memoryRedis() {
  const store = new Map<string, string>();
  return {
    store,
    set: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    getDel: jest.fn(async (k: string) => {
      const v = store.get(k) ?? null;
      store.delete(k);
      return v;
    }),
    setIfAbsent: jest.fn(async (k: string, v: string) => {
      if (store.has(k)) return false;
      store.set(k, v);
      return true;
    }),
  };
}

/**
 * Prisma with an OAuthIdentity table and users kept in memory, so linking is
 * exercised through the real FederationService.resolveUser.
 */
export function memoryPrisma() {
  const identities: Array<{
    id: string;
    userId: string;
    provider: string;
    providerSubject: string;
  }> = [];
  const users = new Map<
    string,
    { id: string; did: string; email: string | null; name: string | null }
  >();
  const prisma = {
    oAuthIdentity: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { provider_providerSubject: { provider: string; providerSubject: string } };
        }) => {
          const key = where.provider_providerSubject;
          const row = identities.find(
            (i) => i.provider === key.provider && i.providerSubject === key.providerSubject,
          );
          return row ? { ...row, user: users.get(row.userId) } : null;
        },
      ),
      update: jest.fn(async () => ({})),
      create: jest.fn(
        async ({
          data,
        }: {
          data: { userId: string; provider: string; providerSubject: string };
        }) => {
          identities.push({ id: `oi${identities.length + 1}`, ...data });
          return {};
        },
      ),
    },
    user: {
      findUnique: jest.fn(async () => null),
      update: jest.fn(async ({ where }: { where: { id: string } }) => users.get(where.id)),
    },
  };
  const identityService = {
    createIdentity: jest.fn(async (email?: string, name?: string) => {
      const id = `u${users.size + 1}`;
      const user = { id, did: `did:key:${id}`, email: email ?? null, name: name ?? null };
      users.set(id, user);
      return user;
    }),
  };
  return { prisma, identityService, identities, users };
}

export function makeTelegram(env: Record<string, string | undefined> = {}) {
  const fullEnv = { TELEGRAM_PROVIDER_ENABLED: 'true', ...BOTS_ENV, ...env };
  const redis = memoryRedis();
  const db = memoryPrisma();
  const federation = new FederationService(
    db.prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    db.identityService as unknown as IdentityService,
    {} as FederationProviders,
  );
  const bots = new TelegramBotsStore(fakeConfig(fullEnv));
  const service = new TelegramAuthService(
    fakeSettings(fullEnv),
    redis as unknown as RedisService,
    bots,
    federation,
  );
  return { service, redis, db, bots };
}
