import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { OAuthTokenIssuerService } from '../oauth-token-issuer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuthAuditService } from '../../audit/oauth-audit.service';
import { fakeSettings } from '../../common/settings/settings.test-fixture';
import { GRACE_MAX_SIBLINGS } from '../refresh-grace';

/**
 * Issue #287 — refresh reuse grace (RFC 9700 §4.14.2). Several processes
 * sharing one refresh token refresh at once; one wins the rotation and the
 * others present a token revoked a moment ago. Before, that tripped theft
 * detection and revoked the whole family, the winner's fresh token included,
 * so every process was signed out. Within the grace window the same client
 * now gets its own sibling pair; outside it, from another client, past the
 * cap, or once the family is revoked, behaviour is exactly as before.
 */

interface Row {
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
  revoked: boolean;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  expiresAt: Date;
}
type Where = Partial<Record<keyof Row, unknown>> & { user?: { did: string } };

const user = { id: 'u1', did: 'did:key:abc', email: 'a@b.com' } as unknown as User;

/** An in-memory refresh_tokens table; transactions run one at a time, as a row lock would. */
function fakeStore() {
  const rows: Row[] = [];
  let lock: Promise<unknown> = Promise.resolve();
  const tick = () => new Promise((r) => setImmediate(r));
  const matches = (r: Row, where: Where) =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'user') return (v as { did: string }).did === user.did && r.userId === user.id;
      if (v && typeof v === 'object' && 'in' in v) {
        return (v as { in: unknown[] }).in.includes(r[k as keyof Row]);
      }
      return r[k as keyof Row] === v;
    });
  const refreshToken = {
    findUnique: async ({ where }: { where: Where }) => {
      await tick();
      const row = rows.find((r) => matches(r, where));
      return row ? { ...row, user } : null;
    },
    findFirst: async ({ where }: { where: Where }) => {
      const row = rows.find((r) => matches(r, where));
      return row ? { companyId: row.companyId, user } : null;
    },
    findMany: async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where)),
    updateMany: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
    create: async ({ data }: { data: Omit<Row, 'id'> }) => {
      const row = { ...data, id: `rt${rows.length + 1}`, revokedAt: null } as Row;
      rows.push(row);
      return row;
    },
  };
  const prisma = {
    rows,
    oAuthClient: { findUnique: async () => ({ companyId: null }) },
    refreshToken,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => {
      const run = lock.then(() => fn({ refreshToken }));
      lock = run.catch(() => undefined);
      return run;
    },
  };
  return prisma;
}

describe('refresh reuse grace (issue #287)', () => {
  let store: ReturnType<typeof fakeStore>;
  let audit: { record: jest.Mock };
  let issuer: OAuthTokenIssuerService;

  const build = (env: Record<string, string> = {}) => {
    store = fakeStore();
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: (k: string, d?: string) =>
        k === 'REFRESH_TOKEN_HMAC_SECRET' ? 'test-secret' : (d ?? ''),
    } as unknown as ConfigService;
    issuer = new OAuthTokenIssuerService(
      store as unknown as PrismaService,
      { sign: () => 'signed.jwt' } as unknown as JwtService,
      config,
      fakeSettings(env),
      undefined,
      undefined,
      undefined,
      audit as unknown as OAuthAuditService,
    );
  };
  beforeEach(() => build());

  const signIn = async () =>
    (await issuer.generateTokens({ user, clientId: 'cli', scope: 'openid' })).refreshToken;
  const refresh = (token: string, clientId = 'cli') => issuer.refreshAccessToken(token, clientId);
  const live = () => store.rows.filter((r) => !r.revoked);
  const events = () => audit.record.mock.calls.map(([e]) => (e as { event: string }).event);

  async function refused(p: Promise<unknown>): Promise<BadRequestException> {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({ error: 'invalid_grant' });
      return e as BadRequestException;
    }
    throw new Error('refresh unexpectedly succeeded');
  }

  it('a replay within grace by the same client gets a working pair and revokes nothing', async () => {
    const a = await signIn();
    const b = (await refresh(a)).refreshToken;
    const sibling = await refresh(a);

    expect(sibling.refreshToken).not.toBe(b);
    expect(live()).toHaveLength(2);
    expect(store.rows.find((r) => r.id === 'rt3')!.rotatedFrom).toBe('rt1');
    // The winner's token still refreshes, and so does the sibling.
    await expect(refresh(b)).resolves.toMatchObject({ accessToken: 'signed.jwt' });
    await expect(refresh(sibling.refreshToken)).resolves.toMatchObject({ scope: 'openid' });
    expect(events()).toEqual(['token.refreshed.grace_replay']);
  });

  it('a replay after the grace window trips theft detection exactly as before', async () => {
    const a = await signIn();
    const b = (await refresh(a)).refreshToken;
    store.rows[0]!.revokedAt = new Date(Date.now() - 31_000);

    await refused(refresh(a));
    expect(live()).toHaveLength(0);
    await refused(refresh(b));
    expect(events()).toContain('token.failed.refresh_reuse');
  });

  it('REFRESH_REUSE_GRACE=0 keeps the old behaviour: an immediate replay is theft', async () => {
    build({ REFRESH_REUSE_GRACE: '0' });
    const a = await signIn();
    await refresh(a);
    await refused(refresh(a));
    expect(live()).toHaveLength(0);
  });

  it('a replay presented by another client is refused as before, with no grant', async () => {
    const a = await signIn();
    await refresh(a);
    const e = await refused(refresh(a, 'other-client'));
    expect(e.getResponse()).toMatchObject({ error_description: 'Invalid refresh token' });
    expect(store.rows).toHaveLength(2);
    expect(live()).toHaveLength(1);
  });

  it('two concurrent refreshes of one token both end holding working tokens', async () => {
    const a = await signIn();
    const [x, y] = await Promise.all([refresh(a), refresh(a)]);
    expect(x.refreshToken).not.toBe(y.refreshToken);
    expect(live()).toHaveLength(2);
    await expect(refresh(x.refreshToken)).resolves.toBeDefined();
    await expect(refresh(y.refreshToken)).resolves.toBeDefined();
    expect(live()).toHaveLength(2);
  });

  it('concurrent replays are bounded by the sibling cap', async () => {
    const a = await signIn();
    await refresh(a);
    const results = await Promise.allSettled(
      Array.from({ length: GRACE_MAX_SIBLINGS + 2 }, () => refresh(a)),
    );
    const minted = store.rows.filter((r) => r.rotatedFrom === 'rt1').length - 1;
    expect(minted).toBeLessThanOrEqual(GRACE_MAX_SIBLINGS);
    expect(results.some((r) => r.status === 'rejected')).toBe(true);
  });

  it('chain: A→B→C rotated within the window; replaying A gets a pair and C stays live', async () => {
    const a = await signIn();
    const b = (await refresh(a)).refreshToken;
    const c = (await refresh(b)).refreshToken;
    await expect(refresh(a)).resolves.toBeDefined();
    await expect(refresh(c)).resolves.toBeDefined();
  });

  it(`the replay after ${GRACE_MAX_SIBLINGS} siblings trips theft`, async () => {
    const a = await signIn();
    await refresh(a);
    for (let i = 0; i < GRACE_MAX_SIBLINGS; i++) await refresh(a);
    expect(live()).toHaveLength(1 + GRACE_MAX_SIBLINGS);
    await refused(refresh(a));
    expect(live()).toHaveLength(0);
  });

  describe('grace never revives a revoked family', () => {
    it('after theft detection', async () => {
      const a = await signIn();
      const b = (await refresh(a)).refreshToken;
      await refresh(b); // A→B→C
      store.rows[0]!.revokedAt = new Date(Date.now() - 60_000);
      await refused(refresh(a)); // outside grace: theft, C revoked with the family
      // B was rotated a moment ago, but its chain ends in a revoked C.
      await refused(refresh(b));
      expect(live()).toHaveLength(0);
      expect(store.rows).toHaveLength(3);
    });

    it('after /oauth/revoke of the live token', async () => {
      const a = await signIn();
      const b = (await refresh(a)).refreshToken;
      await issuer.revokeToken(b, 'cli');
      await refused(refresh(a));
      expect(live()).toHaveLength(0);
    });

    it('after logout (every refresh token of the person revoked)', async () => {
      const a = await signIn();
      await refresh(a);
      await store.refreshToken.updateMany({
        where: { revoked: false, user: { did: user.did } },
        data: { revoked: true, revokedAt: new Date() },
      });
      await refused(refresh(a));
      expect(live()).toHaveLength(0);
    });
  });

  it.each([
    ['10m', 600],
    ['1h', 3600],
    ['3600s', 3600],
  ])('expires_in follows JWT_ACCESS_TOKEN_EXPIRY=%s', async (ttl, seconds) => {
    build({ JWT_ACCESS_TOKEN_EXPIRY: ttl });
    const first = await issuer.generateTokens({ user, clientId: 'cli', scope: 'openid' });
    expect(first.expiresIn).toBe(seconds);
    await expect(refresh(first.refreshToken)).resolves.toMatchObject({ expiresIn: seconds });
  });
});
