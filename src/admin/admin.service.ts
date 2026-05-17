import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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

  async rotateClientSecret(clientId: string) {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    if (!client) return null;

    const newSecret = crypto.randomBytes(32).toString('base64url');
    const newSecretHash = await bcrypt.hash(newSecret, 10);

    await this.prisma.oAuthClient.update({
      where: { clientId },
      data: { clientSecretHash: newSecretHash },
    });

    return {
      clientId,
      clientSecret: newSecret,
      message: 'Secret rotated successfully. Save this secret - it will not be shown again!',
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
