import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { OAuthTokenIssuerService } from '../oauth-token-issuer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuthAuditService } from '../../audit/oauth-audit.service';
import { FieldCrypto } from '../../common/field-crypto';
import { fakeSettings } from '../../common/settings/settings.test-fixture';
import { settingDef, validateSettingValue } from '../../common/settings/settings.registry';
import { eraseExpiredReplays, graceWindowMs } from '../refresh-grace';
import type { RefreshBoundClient } from '../refresh-bounds';

/**
 * Issue #287 — refresh reuse grace (RFC 9700 §4.14.2, the reuse-interval
 * pattern). Several processes sharing one refresh token refresh at once; one
 * wins the rotation and the others present a token revoked a moment ago.
 * Before, that tripped theft detection and revoked the whole family, the
 * winner's fresh token included. Within the grace window the same client now
 * gets back the SAME pair the winner got: one chain, nothing new minted.
 * Outside the window, from another client, or once the family is revoked,
 * behaviour is exactly as before.
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
  graceReplay: string | null;
  graceReplayUntil: Date | null;
  revoked: boolean;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  expiresAt: Date;
}
type Where = Record<string, unknown>;

const user = { id: 'u1', did: 'did:key:abc', email: 'a@b.com' } as unknown as User;
const SIGNING_SECRET = 'test-only-signing-secret-of-32-chars!';
const FIELD_KEY = 'test-only-field-encryption-key';

/** One column condition: a value, or { in | gt | lt | not }. */
function matchesValue(actual: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== 'object' || cond instanceof Date) return actual === cond;
  const c = cond as { in?: unknown[]; gt?: Date; lt?: Date; not?: unknown };
  if (c.in) return c.in.includes(actual);
  if (c.gt) return actual instanceof Date && actual > c.gt;
  if (c.lt) return actual instanceof Date && actual < c.lt;
  if ('not' in c) return actual !== c.not;
  return false;
}

/** An in-memory refresh_tokens table; transactions run one at a time, as a row lock would. */
function fakeStore() {
  const rows: Row[] = [];
  let lock: Promise<unknown> = Promise.resolve();
  const tick = () => new Promise((r) => setImmediate(r));
  const matches = (r: Row, where: Where) =>
    Object.entries(where).every(([k, v]) =>
      k === 'user'
        ? (v as { did: string }).did === user.did && r.userId === user.id
        : matchesValue(r[k as keyof Row], v),
    );
  const refreshToken = {
    findUnique: async ({ where }: { where: Where }) => {
      await tick();
      const row = rows.find((r) => matches(r, where));
      return row ? { ...row, user } : null;
    },
    findFirst: async ({ where }: { where: Where }) => {
      const row = rows.find((r) => matches(r, where));
      return row ? { ...row, user } : null;
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
  return {
    rows,
    oAuthClient: { findUnique: async () => ({ companyId: null }) },
    refreshToken,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => {
      const run = lock.then(() => fn({ refreshToken }));
      lock = run.catch(() => undefined);
      return run;
    },
  };
}

describe('refresh reuse grace (issue #287)', () => {
  let store: ReturnType<typeof fakeStore>;
  let audit: { record: jest.Mock };
  let issuer: OAuthTokenIssuerService;
  let jwt: JwtService;

  const build = (env: Record<string, string> = {}, fieldKey: string | null = FIELD_KEY) => {
    store = fakeStore();
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    jwt = new JwtService({ secret: SIGNING_SECRET });
    const config = {
      get: (k: string, d?: string) =>
        k === 'REFRESH_TOKEN_HMAC_SECRET' ? 'test-secret' : (d ?? ''),
    } as unknown as ConfigService;
    issuer = new OAuthTokenIssuerService(
      store as unknown as PrismaService,
      jwt,
      config,
      fakeSettings(env),
      undefined,
      undefined,
      undefined,
      audit as unknown as OAuthAuditService,
      FieldCrypto.fromEnv(fieldKey),
    );
  };
  beforeEach(() => build());

  const signIn = async () =>
    (await issuer.generateTokens({ user, clientId: 'cli', scope: 'openid' })).refreshToken;
  const refresh = (token: string, clientId = 'cli', client?: RefreshBoundClient) =>
    issuer.refreshAccessToken(token, clientId, client);
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

  it('two processes racing both end holding the same working pair, 20 races in a row', async () => {
    let token = await signIn();
    for (let race = 0; race < 20; race++) {
      const [x, y] = await Promise.all([refresh(token), refresh(token)]);
      expect(y.refreshToken).toBe(x.refreshToken);
      expect(y.accessToken).toBe(x.accessToken);
      expect(live()).toHaveLength(1); // one chain: nothing extra minted, nothing revoked
      token = x.refreshToken;
    }
    await expect(refresh(token)).resolves.toBeDefined();
    expect(events()).not.toContain('token.failed.refresh_reuse');
  });

  it('a sequential replay within grace gets the same pair and revokes nothing', async () => {
    const a = await signIn();
    const won = await refresh(a);
    const replay = await refresh(a);
    expect(replay.refreshToken).toBe(won.refreshToken);
    expect(live()).toHaveLength(1);
    expect(events()).toEqual(['token.refreshed.grace_reuse']);
    await expect(refresh(won.refreshToken)).resolves.toBeDefined();
  });

  it('the returned access token is the winner’s, still valid, with what is left of its life', async () => {
    build({ JWT_ACCESS_TOKEN_EXPIRY: '1h' });
    const a = await signIn();
    const won = await refresh(a);
    const replay = await refresh(a);
    expect(replay.accessToken).toBe(won.accessToken);
    expect(() => jwt.verify(replay.accessToken)).not.toThrow();
    expect(replay.expiresIn).toBeLessThanOrEqual(3600);
    expect(replay.expiresIn).toBeGreaterThanOrEqual(3598);
  });

  it('a replay after the grace window trips theft detection, and the kept pair is gone', async () => {
    const a = await signIn();
    const b = (await refresh(a)).refreshToken;
    store.rows[0]!.revokedAt = new Date(Date.now() - 31_000);
    await refused(refresh(a));
    expect(live()).toHaveLength(0);
    expect(store.rows[0]!.graceReplay).toBeNull();
    await refused(refresh(b));
    expect(events()).toContain('token.failed.refresh_reuse');
  });

  it('a replay presented by another client is refused as before, with nothing changed', async () => {
    const a = await signIn();
    await refresh(a);
    const e = await refused(refresh(a, 'other-client'));
    expect(e.getResponse()).toMatchObject({ error_description: 'Invalid refresh token' });
    expect(store.rows).toHaveLength(2);
    expect(live()).toHaveLength(1);
  });

  it('within grace, a child already rotated: refused, nothing revoked', async () => {
    const a = await signIn();
    const b = (await refresh(a)).refreshToken;
    const c = (await refresh(b)).refreshToken;
    const e = await refused(refresh(a));
    expect(e.getResponse()).toMatchObject({ error_description: 'Refresh token already rotated' });
    expect(live()).toHaveLength(1);
    expect(events()).not.toContain('token.failed.refresh_reuse');
    await expect(refresh(c)).resolves.toBeDefined();
  });

  describe('a revoked family gets nothing back', () => {
    it('after logout (every refresh token of the person revoked)', async () => {
      const a = await signIn();
      await refresh(a);
      await store.refreshToken.updateMany({
        where: { revoked: false, user: { did: user.did } },
        data: { revoked: true, revokedAt: new Date() },
      });
      await refused(refresh(a));
      expect(live()).toHaveLength(0);
      expect(store.rows.every((r) => r.graceReplay === null)).toBe(true);
    });

    it('after /oauth/revoke of the child', async () => {
      const a = await signIn();
      const b = (await refresh(a)).refreshToken;
      await issuer.revokeToken(b, 'cli');
      await refused(refresh(a));
      expect(live()).toHaveLength(0);
    });

    it('after theft detection', async () => {
      const a = await signIn();
      const b = (await refresh(a)).refreshToken;
      await refresh(b); // A→B→C
      store.rows[0]!.revokedAt = new Date(Date.now() - 60_000);
      await refused(refresh(a)); // outside grace: theft, C revoked
      await refused(refresh(b)); // B rotated a moment ago, but its child is revoked
      expect(live()).toHaveLength(0);
    });
  });

  it('the pair is kept encrypted, bound to its row, and erased by the cleanup after the window', async () => {
    const a = await signIn();
    const won = await refresh(a);
    const parent = store.rows[0]!;
    expect(FieldCrypto.isEncrypted(parent.graceReplay)).toBe(true);
    expect(parent.graceReplay).not.toContain(won.refreshToken);
    // A kept pair copied onto another row does not open there.
    const b = store.rows[1]!;
    b.graceReplay = parent.graceReplay;
    b.graceReplayUntil = parent.graceReplayUntil;

    expect(await eraseExpiredReplays(store as unknown as PrismaService, new Date())).toBe(0);
    expect(
      await eraseExpiredReplays(store as unknown as PrismaService, new Date(Date.now() + 31_000)),
    ).toBe(2);
    expect(store.rows.every((r) => r.graceReplay === null && r.graceReplayUntil === null)).toBe(
      true,
    );
    await refused(refresh(a)); // nothing kept any more: theft as before
  });

  it('without FIELD_ENCRYPTION_KEY nothing is kept (never plaintext) and the grace is off', async () => {
    build({}, null);
    const a = await signIn();
    const [x, y] = await Promise.allSettled([refresh(a), refresh(a)]);
    expect([x.status, y.status].sort()).toEqual(['fulfilled', 'rejected']);
    expect(store.rows.every((r) => r.graceReplay === null)).toBe(true);
    await refused(refresh(a)); // a later replay is theft, as before the grace
    expect(live()).toHaveLength(0);
  });

  it('REFRESH_REUSE_GRACE=0 keeps the old behaviour: an immediate replay is theft', async () => {
    build({ REFRESH_REUSE_GRACE: '0' });
    const a = await signIn();
    await refresh(a);
    expect(store.rows[0]!.graceReplay).toBeNull();
    await refused(refresh(a));
    expect(live()).toHaveLength(0);
  });

  it('an expired token on the grace path is theft as before', async () => {
    const a = await signIn();
    await refresh(a);
    store.rows[0]!.expiresAt = new Date(Date.now() - 1);
    await refused(refresh(a));
    expect(live()).toHaveLength(0);
  });

  it('the replay gets exactly what the rotation granted under the client row', async () => {
    const MCP = 'https://mcp.example.com/api';
    const client: RefreshBoundClient = {
      clientId: 'cli',
      allowedScopes: ['brain:read'],
      allowedAudiences: [MCP],
    };
    const { refreshToken: a } = await issuer.generateTokens({
      user,
      clientId: 'cli',
      scope: 'openid brain:read brain:write',
      audience: MCP,
    });
    const won = await refresh(a, 'cli', client);
    expect(won.scope).toBe('openid brain:read');
    await expect(refresh(a, 'cli', client)).resolves.toEqual(
      expect.objectContaining({ scope: won.scope, refreshToken: won.refreshToken }),
    );
    expect(jwt.decode<{ aud: string }>(won.accessToken).aud).toBe(MCP);
  });

  describe('REFRESH_REUSE_GRACE is at most 60 s', () => {
    it('the settings API refuses a longer value', () => {
      const def = settingDef('REFRESH_REUSE_GRACE')!;
      expect(validateSettingValue(def, '60s')).toBeNull();
      expect(validateSettingValue(def, '0')).toBeNull();
      expect(validateSettingValue(def, '61s')).toMatch(/at most 60s/);
      expect(validateSettingValue(def, '1h')).toMatch(/at most 60s/);
    });

    it('an env value over the bound is clamped at runtime', async () => {
      expect(graceWindowMs(fakeSettings({ REFRESH_REUSE_GRACE: '1h' }))).toBe(60_000);
      build({ REFRESH_REUSE_GRACE: '1h' });
      const a = await signIn();
      await refresh(a);
      store.rows[0]!.revokedAt = new Date(Date.now() - 61_000);
      await refused(refresh(a));
      expect(live()).toHaveLength(0);
    });
  });

  it.each([
    ['3600', 3600],
    ['10m', 600],
    ['1h', 3600],
    ['3600s', 3600],
  ])(
    'expires_in and the signed exp both follow JWT_ACCESS_TOKEN_EXPIRY=%s',
    async (ttl, seconds) => {
      // The real signer: a unitless STRING would be read as milliseconds by
      // jsonwebtoken (a 3.6 s token told `expires_in: 3600`).
      build({ JWT_ACCESS_TOKEN_EXPIRY: ttl });
      const first = await issuer.generateTokens({ user, clientId: 'cli', scope: 'openid' });
      expect(first.expiresIn).toBe(seconds);
      for (const token of [first.accessToken, first.idToken]) {
        const { exp, iat } = jwt.decode<{ exp: number; iat: number }>(token);
        expect(exp - iat).toBe(seconds);
      }
      await expect(refresh(first.refreshToken)).resolves.toMatchObject({ expiresIn: seconds });
    },
  );
});
