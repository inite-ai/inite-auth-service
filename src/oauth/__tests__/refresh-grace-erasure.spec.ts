import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthTokenIssuerService } from '../oauth-token-issuer.service';
import { ConsentService } from '../consent.service';
import { BackchannelLogoutService } from '../backchannel-logout.service';
import { SessionService } from '../../session/session.service';
import { IdentityAccountService } from '../../identity/identity-account.service';
import { IdentityService } from '../../identity/identity.service';
import { EmailService } from '../../email/email.service';
import { AdminService } from '../../admin/admin.service';
import { AdminClientsService } from '../../admin/admin-clients.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FieldCrypto } from '../../common/field-crypto';
import { fakeSettings } from '../../common/settings/settings.test-fixture';
import { fakeStore, fixtureUser } from './refresh-store.fixture';

/**
 * Issue #287 — the refresh reuse grace keeps a rotation's pair, encrypted, on
 * the rotated row for the window. That row is already revoked, so a revoke's
 * own `revoked: false` filter never reaches it: every revoke path must erase
 * the kept pair too, or a pair the person meant to end would sit at rest (and
 * be one decryption from use) after they revoked it.
 */
describe('no kept refresh pair outlives a revoke', () => {
  let store: ReturnType<typeof fakeStore>;
  let issuer: OAuthTokenIssuerService;
  let prisma: PrismaService;

  /** Sign in and rotate once: the pair is kept on the first row; returns the live token. */
  async function rotated(): Promise<{ child: string; childId: string }> {
    const first = await issuer.generateTokens({
      user: fixtureUser,
      clientId: 'cli',
      scope: 'openid',
    });
    const second = await issuer.refreshAccessToken(first.refreshToken, 'cli');
    expect(store.rows[0]!.graceReplay).not.toBeNull();
    return { child: second.refreshToken, childId: store.rows[1]!.id };
  }
  const noKeptPair = () =>
    expect(store.rows.filter((r) => r.graceReplay !== null || r.graceReplayUntil !== null)).toEqual(
      [],
    );

  beforeEach(() => {
    store = fakeStore();
    prisma = store as unknown as PrismaService;
    const config = {
      get: (k: string, d?: string) =>
        k === 'REFRESH_TOKEN_HMAC_SECRET' ? 'test-secret' : (d ?? ''),
    } as unknown as ConfigService;
    issuer = new OAuthTokenIssuerService(
      prisma,
      new JwtService({ secret: 'test-only-signing-secret-of-32-chars!' }),
      config,
      fakeSettings({}),
      undefined,
      undefined,
      undefined,
      undefined,
      FieldCrypto.fromEnv('test-only-field-encryption-key'),
    );
  });

  it('admin: revoke all of a person’s sessions', async () => {
    await rotated();
    const admin = new AdminService(prisma, {} as AdminClientsService);
    await admin.revokeAllUserSessions(fixtureUser.id);
    noKeptPair();
  });

  it('password change', async () => {
    await rotated();
    const email = { sendPasswordChanged: async () => undefined } as unknown as EmailService;
    const account = new IdentityAccountService(prisma, email, {} as IdentityService);
    await account.changePassword(fixtureUser.id, 'unused', 'NewPassw0rd');
    noKeptPair();
  });

  it('logout (back-channel: every refresh token of the person)', async () => {
    await rotated();
    const logout = new BackchannelLogoutService(prisma, {} as JwtService, {} as ConfigService);
    await logout.endRelyingPartySessions({ userDid: fixtureUser.did! });
    noKeptPair();
  });

  it('consent revoke (disconnect an application)', async () => {
    await rotated();
    await new ConsentService(prisma).revoke(fixtureUser.id, 'cli');
    noKeptPair();
  });

  it('session revoke: the one session', async () => {
    const { childId } = await rotated();
    await new SessionService(prisma).revokeSession(fixtureUser.id, childId);
    noKeptPair();
  });

  it('session revoke: all sessions', async () => {
    await rotated();
    await new SessionService(prisma).revokeAllSessions(fixtureUser.id);
    noKeptPair();
  });

  it('/oauth/revoke of the live token (RFC 7009)', async () => {
    const { child } = await rotated();
    await issuer.revokeToken(child, 'cli');
    noKeptPair();
  });
});
