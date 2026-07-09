import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthAuditService } from '../audit/oauth-audit.service';
import { BackchannelLogoutService } from '../oauth/backchannel-logout.service';
import { LoggerService } from '../common/logger.service';
import { swallow } from '../common/fire-and-forget';
import { AdminClientsService } from './admin-clients.service';

@Injectable()
export class AdminService {
  private readonly logger = new LoggerService();

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: AdminClientsService,
    @Optional() private readonly audit?: OAuthAuditService,
    @Optional() private readonly backchannelLogout?: BackchannelLogoutService,
  ) {}

  // ==================== Users ====================

  async getAllUsers(page = 1, limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip: (page - 1) * safeLimit,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    return {
      users: users.map(({ passwordHash, ...user }) => user),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    const [passkeys, wallets, activeSessions] = await Promise.all([
      this.prisma.passkey.findMany({
        where: { userId },
        select: { id: true, credentialId: true, deviceName: true, createdAt: true, lastUsedAt: true },
      }),
      this.prisma.wallet.findMany({
        where: { userId },
        select: { id: true, address: true, chain: true, linkedAt: true },
      }),
      this.prisma.refreshToken.count({
        where: { userId, revoked: false },
      }),
    ]);

    const { passwordHash, ...safeUser } = user;
    return {
      ...safeUser,
      passkeys,
      wallets,
      stats: {
        activeSessions,
        totalPasskeys: passkeys.length,
        totalWallets: wallets.length,
      },
    };
  }

  async updateUser(
    userId: string,
    data: Partial<{
      name: string;
      email: string;
      emailVerified: boolean;
      bio: string;
      location: string;
      profession: string;
      metadata: Record<string, any>;
    }>,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    const updateData: any = {};
    const allowedFields = ['name', 'email', 'emailVerified', 'bio', 'location', 'profession'] as const;

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    if (data.metadata !== undefined) {
      updateData.metadata = { ...user.metadata as any, ...data.metadata };
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
    const { passwordHash, ...safeUser } = updated;
    return safeUser;
  }

  async updateUserRoles(userId: string, roles: string[]) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        metadata: {
          ...user.metadata as any,
          roles,
          isAdmin: roles.includes('admin'),
        },
      },
    });
    const { passwordHash, ...safeUser } = updated;
    return safeUser;
  }

  async deleteUser(userId: string) {
    // Cascade delete handles related records
    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true };
  }

  /**
   * Emergency kick: invalidate every active refresh token for the
   * user, set a 24h lockout so /password/login refuses while the
   * incident is resolved, and best-effort fan out a back-channel
   * logout to every RP that registered one.
   *
   * Active access tokens already minted live until their (short)
   * expiry — typically 10 minutes. Anything longer-lived for this
   * user requires a fresh refresh, which is now revoked, so the
   * user can't reauthenticate by token alone.
   *
   * Use cases: password leak, lost device, account compromise.
   */
  async revokeAllUserSessions(
    userId: string,
    opts: { reason?: string; lockoutHours?: number } = {},
  ): Promise<{
    success: true;
    refreshTokensRevoked: number;
    lockoutUntil: string;
    backchannelLogoutRecipients: number;
  }> {
    // Postgres rejects non-UUID strings on this column — surface a 400
    // instead of letting Prisma throw a 500 from inside findUnique.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      throw new BadRequestException(`Invalid userId — not a UUID: ${userId}`);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, did: true, email: true },
    });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const now = new Date();
    const lockoutHours = Math.min(Math.max(opts.lockoutHours ?? 24, 0), 24 * 7);
    const lockoutUntil = new Date(now.getTime() + lockoutHours * 60 * 60 * 1000);

    // 1) Revoke every active refresh token. Use updateMany so we
    //    pick up tokens across all clients in one statement.
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true, revokedAt: now },
    });

    // 2) Lockout so password login can't immediately reissue. The
    //    user-flow timing-equaliser already runs the lockout check
    //    before bcrypt, so this is sharp.
    await this.prisma.user.update({
      where: { id: userId },
      data: { lockoutUntil, failedLoginCount: 0 },
    });

    // 3) Best-effort back-channel logout fan-out. Bounded by the
    //    service's per-RP timeout so a slow RP can't tail-latency
    //    the admin response.
    let bclRecipients = 0;
    if (this.backchannelLogout && user.did) {
      try {
        bclRecipients = await this.backchannelLogout.fanOut({
          userDid: user.did,
        });
      } catch {
        bclRecipients = 0;
      }
    }

    // 4) Audit.
    this.audit
      ?.record({
        event: 'admin.user.sessions_revoked',
        sub: user.did,
        success: true,
        metadata: {
          userId,
          email: user.email,
          refreshTokensRevoked: revoked.count,
          lockoutHours,
          lockoutUntil: lockoutUntil.toISOString(),
          backchannelRecipients: bclRecipients,
          reason: opts.reason ?? null,
        },
      })
      .catch(swallow(this.logger, 'audit admin.user.sessions_revoked'));

    return {
      success: true,
      refreshTokensRevoked: revoked.count,
      lockoutUntil: lockoutUntil.toISOString(),
      backchannelLogoutRecipients: bclRecipients,
    };
  }

  // ==================== OAuth Clients (delegated to AdminClientsService) ====================

  getAllOAuthClients() {
    return this.clients.getAllOAuthClients();
  }

  getOAuthClientById(clientId: string) {
    return this.clients.getOAuthClientById(clientId);
  }

  createOAuthClient(data: {
    name: string;
    clientId: string;
    redirectUris: string[];
    allowedScopes?: string[];
    allowedGrants?: string[];
    companyId?: string | null;
    allowedAudiences?: string[];
    backchannelLogoutUri?: string | null;
  }) {
    return this.clients.createOAuthClient(data);
  }

  updateOAuthClient(
    clientId: string,
    data: Partial<{
      name: string;
      redirectUris: string[];
      allowedScopes: string[];
      allowedGrants: string[];
      companyId: string | null;
      allowedAudiences: string[];
      active: boolean;
      logoUrl: string;
      privacyPolicyUrl: string;
      termsOfServiceUrl: string;
      backchannelLogoutUri: string | null;
    }>,
  ) {
    return this.clients.updateOAuthClient(clientId, data);
  }

  rotateClientSecret(
    clientId: string,
    opts: { graceWindowSeconds?: number; force?: boolean } = {},
  ) {
    return this.clients.rotateClientSecret(clientId, opts);
  }

  deleteOAuthClient(clientId: string) {
    return this.clients.deleteOAuthClient(clientId);
  }

  // ==================== Stats ====================

  async getStats() {
    const [totalUsers, totalClients, totalPasskeys, totalWallets, activeTokens, recentUsers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.oAuthClient.count(),
      this.prisma.passkey.count(),
      this.prisma.wallet.count(),
      this.prisma.refreshToken.count({ where: { revoked: false } }),
      this.prisma.user.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      totalUsers,
      totalClients,
      totalPasskeys,
      totalWallets,
      activeTokens,
      recentUsers,
    };
  }
}
