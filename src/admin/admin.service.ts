import { Injectable, Optional } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthAuditService } from '../audit/oauth-audit.service';
import { BackchannelLogoutService } from '../oauth/backchannel-logout.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, did: true, email: true },
    });
    if (!user) {
      throw new Error(`User ${userId} not found`);
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
      .catch(() => {});

    return {
      success: true,
      refreshTokensRevoked: revoked.count,
      lockoutUntil: lockoutUntil.toISOString(),
      backchannelLogoutRecipients: bclRecipients,
    };
  }

  // ==================== OAuth Clients ====================

  async getAllOAuthClients() {
    const clients = await this.prisma.oAuthClient.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return clients.map(({ clientSecretHash, ...client }) => client);
  }

  async getOAuthClientById(clientId: string) {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    if (!client) return null;

    const [totalCodes, totalTokens, activeTokens] = await Promise.all([
      this.prisma.authorizationCode.count({ where: { clientId } }),
      this.prisma.refreshToken.count({ where: { clientId } }),
      this.prisma.refreshToken.count({ where: { clientId, revoked: false } }),
    ]);

    const { clientSecretHash, ...safeClient } = client;
    return {
      ...safeClient,
      stats: {
        totalAuthCodes: totalCodes,
        totalTokens,
        activeTokens,
      },
    };
  }

  async createOAuthClient(data: {
    name: string;
    clientId: string;
    redirectUris: string[];
    allowedScopes?: string[];
    allowedGrants?: string[];
    companyId?: string | null;
    allowedAudiences?: string[];
    backchannelLogoutUri?: string | null;
  }) {
    const clientSecret = crypto.randomBytes(32).toString('base64url');
    const clientSecretHash = await bcrypt.hash(clientSecret, 10);

    const client = await this.prisma.oAuthClient.create({
      data: {
        clientId: data.clientId,
        name: data.name,
        redirectUris: data.redirectUris,
        clientSecretHash,
        allowedScopes: data.allowedScopes ?? ['openid', 'profile', 'email'],
        // Prisma uses the schema default when the field is omitted, so we
        // only set allowedGrants explicitly when the operator picked one.
        ...(data.allowedGrants && data.allowedGrants.length > 0
          ? { allowedGrants: data.allowedGrants }
          : {}),
        allowedAudiences: data.allowedAudiences ?? [],
        companyId: data.companyId ?? null,
        backchannelLogoutUri: data.backchannelLogoutUri ?? null,
      },
    });

    const { clientSecretHash: _, ...safeClient } = client;
    return {
      ...safeClient,
      clientSecret,
      message: 'Save this client secret - it will not be shown again!',
    };
  }

  async updateOAuthClient(
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
    try {
      const client = await this.prisma.oAuthClient.update({
        where: { clientId },
        data,
      });
      const { clientSecretHash, ...safeClient } = client;
      return safeClient;
    } catch {
      return null;
    }
  }

  /**
   * Rotate a client secret with an optional grace window.
   *
   * Default behaviour: previous secret stays valid for 24h after
   * rotation so deployed callers can roll forward without an outage.
   * Pass `force: true` to revoke the old secret immediately — used
   * when the old value is known to be compromised.
   *
   * Grace window is capped at 7 days. Anything longer should be
   * handled by issuing a brand-new client instead, so the audit
   * trail stays clean.
   */
  async rotateClientSecret(
    clientId: string,
    opts: { graceWindowSeconds?: number; force?: boolean } = {},
  ) {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    if (!client) return null;

    const newSecret = crypto.randomBytes(32).toString('base64url');
    const newSecretHash = await bcrypt.hash(newSecret, 10);

    const maxGraceSeconds = 7 * 24 * 60 * 60;
    const requested = opts.graceWindowSeconds ?? 24 * 60 * 60;
    const graceSeconds = Math.min(Math.max(requested, 0), maxGraceSeconds);

    const data: any = {
      clientSecretHash: newSecretHash,
    };
    if (opts.force || graceSeconds === 0) {
      data.previousSecretHash = null;
      data.previousSecretExpiresAt = null;
    } else {
      data.previousSecretHash = client.clientSecretHash;
      data.previousSecretExpiresAt = new Date(Date.now() + graceSeconds * 1000);
    }

    await this.prisma.oAuthClient.update({
      where: { clientId },
      data,
    });

    return {
      clientId,
      clientSecret: newSecret,
      graceWindowSeconds: opts.force ? 0 : graceSeconds,
      previousSecretExpiresAt: data.previousSecretExpiresAt ?? null,
      message:
        opts.force
          ? 'Secret rotated. Previous secret revoked immediately. Save this secret — it will not be shown again.'
          : `Secret rotated. Previous secret accepted for ${graceSeconds}s. Save this secret — it will not be shown again.`,
    };
  }

  async deleteOAuthClient(clientId: string) {
    await this.prisma.authorizationCode.deleteMany({ where: { clientId } });
    await this.prisma.refreshToken.deleteMany({ where: { clientId } });
    await this.prisma.oAuthClient.delete({ where: { clientId } });
    return { success: true };
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
