import type { User } from '@prisma/client';

/**
 * An in-memory `refresh_tokens` table (plus the few other rows the revoke
 * paths touch) for the refresh-reuse-grace specs. Transactions run one at a
 * time, as the row lock on a claimed token makes them; the array form of
 * `$transaction` runs its operations in order.
 */

export interface Row {
  id: string;
  tokenLookup: string;
  userId: string;
  clientId: string;
  companyId: string | null;
  scope: string | null;
  nonce: string | null;
  amr: string[];
  authorizationDetails: unknown;
  resource: string | null;
  rotatedFrom: string | null;
  graceReplay: string | null;
  graceReplayUntil: Date | null;
  revoked: boolean;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  expiresAt: Date;
}
type Where = Record<string, unknown>;

export const fixtureUser = {
  id: '00000000-0000-4000-8000-000000000001',
  did: 'did:key:abc',
  email: 'a@b.com',
  name: 'A',
  passwordHash: null,
} as unknown as User;

/** One column condition: a value, or { in | not | gt | lt }. */
function matchesValue(actual: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== 'object' || cond instanceof Date) return actual === cond;
  const c = cond as { in?: unknown[]; gt?: Date; lt?: Date; not?: unknown };
  if (c.in) return c.in.includes(actual);
  if (c.gt) return actual instanceof Date && actual > c.gt;
  if (c.lt) return actual instanceof Date && actual < c.lt;
  if ('not' in c) return actual !== c.not;
  return false;
}

function matches(r: Row, where: Where): boolean {
  return Object.entries(where).every(([k, v]) =>
    k === 'user'
      ? (v as { did: string }).did === fixtureUser.did && r.userId === fixtureUser.id
      : matchesValue(r[k as keyof Row], v),
  );
}

export function fakeStore() {
  const rows: Row[] = [];
  let lock: Promise<unknown> = Promise.resolve();
  const tick = () => new Promise((r) => setImmediate(r));
  const refreshToken = {
    findUnique: async ({ where }: { where: Where }) => {
      await tick();
      const row = rows.find((r) => matches(r, where));
      return row ? { ...row, user: fixtureUser } : null;
    },
    findFirst: async ({ where }: { where: Where }) => {
      const row = rows.find((r) => matches(r, where));
      return row ? { ...row, user: fixtureUser } : null;
    },
    count: async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where)).length,
    updateMany: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
    create: async ({ data }: { data: Omit<Row, 'id'> }) => {
      // The column defaults the database applies (schema.prisma).
      const defaults = { graceReplay: null, graceReplayUntil: null, revokedAt: null };
      const row = { ...defaults, ...data, id: `rt${rows.length + 1}` } as Row;
      rows.push(row);
      return row;
    },
  };
  const store = {
    rows,
    oAuthClient: {
      findUnique: async () => ({ companyId: null }),
      findMany: async () => [],
    },
    oAuthConsent: { deleteMany: async () => ({ count: 0 }) },
    user: {
      findUnique: async () => fixtureUser,
      update: async () => fixtureUser,
    },
    refreshToken,
    $transaction: (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[]);
      const fn = arg as (tx: unknown) => Promise<unknown>;
      const run = lock.then(() => fn({ refreshToken }));
      lock = run.catch(() => undefined);
      return run;
    },
  };
  return store;
}
