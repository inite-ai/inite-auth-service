import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import {
  User,
  OAuthClient,
  Passkey,
  Wallet,
  RefreshToken,
  AuthorizationCode,
} from '../database/entities';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(OAuthClient)
    private readonly oauthClientRepository: Repository<OAuthClient>,
    @InjectRepository(Passkey)
    private readonly passkeyRepository: Repository<Passkey>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(AuthorizationCode)
    private readonly authCodeRepository: Repository<AuthorizationCode>,
  ) {}

  // ==================== Users ====================

  async getAllUsers(page = 1, limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const [users, total] = await this.userRepository.findAndCount({
      skip: (page - 1) * safeLimit,
      take: safeLimit,
      order: { createdAt: 'DESC' },
    });

    return {
      users: users.map((user) => ({
        ...user,
        passwordHash: undefined, // Don't expose password hashes
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getUserById(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return null;

    const passkeys = await this.passkeyRepository.find({
      where: { userId },
      select: ['id', 'credentialId', 'deviceName', 'createdAt', 'lastUsedAt'],
    });

    const wallets = await this.walletRepository.find({
      where: { userId },
      select: ['id', 'address', 'chain', 'linkedAt'],
    });

    const activeSessions = await this.refreshTokenRepository.count({
      where: { userId, revoked: false },
    });

    return {
      ...user,
      passwordHash: undefined,
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
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return null;

    const allowedFields = [
      'name',
      'email',
      'emailVerified',
      'bio',
      'location',
      'profession',
    ] as const;

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        (user as any)[field] = data[field];
      }
    }

    if (data.metadata !== undefined) {
      user.metadata = { ...user.metadata, ...data.metadata };
    }

    await this.userRepository.save(user);
    return { ...user, passwordHash: undefined };
  }

  async updateUserRoles(userId: string, roles: string[]) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return null;

    user.metadata = {
      ...user.metadata,
      roles,
      isAdmin: roles.includes('admin'),
    };

    await this.userRepository.save(user);
    return { ...user, passwordHash: undefined };
  }

  async deleteUser(userId: string) {
    // Delete related data
    await this.passkeyRepository.delete({ userId });
    await this.walletRepository.delete({ userId });
    await this.refreshTokenRepository.delete({ userId });
    await this.authCodeRepository.delete({ userId });

    // Delete user
    await this.userRepository.delete(userId);
    return { success: true };
  }

  // ==================== OAuth Clients ====================

  async getAllOAuthClients() {
    const clients = await this.oauthClientRepository.find({
      order: { createdAt: 'DESC' },
    });

    return clients.map((client) => ({
      ...client,
      clientSecretHash: undefined,
      allowedScopes: Array.isArray(client.allowedScopes) ? client.allowedScopes : [],
      allowedGrants: Array.isArray(client.allowedGrants) ? client.allowedGrants : [],
      redirectUris: Array.isArray(client.redirectUris) ? client.redirectUris : [],
    }));
  }

  async getOAuthClientById(clientId: string) {
    const client = await this.oauthClientRepository.findOne({
      where: { clientId },
    });

    if (!client) return null;

    // Get usage stats
    const totalCodes = await this.authCodeRepository.count({
      where: { clientId },
    });

    const totalTokens = await this.refreshTokenRepository.count({
      where: { clientId },
    });

    const activeTokens = await this.refreshTokenRepository.count({
      where: { clientId, revoked: false },
    });

    return {
      ...client,
      clientSecretHash: undefined,
      allowedScopes: Array.isArray(client.allowedScopes) ? client.allowedScopes : [],
      allowedGrants: Array.isArray(client.allowedGrants) ? client.allowedGrants : [],
      redirectUris: Array.isArray(client.redirectUris) ? client.redirectUris : [],
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
  }) {
    // Generate a secure client secret
    const clientSecret = crypto.randomBytes(32).toString('base64url');
    const clientSecretHash = await bcrypt.hash(clientSecret, 10);

    const client = this.oauthClientRepository.create({
      clientId: data.clientId,
      name: data.name,
      redirectUris: data.redirectUris,
      clientSecretHash,
      allowedScopes: data.allowedScopes || ['openid', 'profile', 'email'],
    });

    await this.oauthClientRepository.save(client);
    
    // Return the secret only once during creation
    return { 
      ...client, 
      clientSecret,
      clientSecretHash: undefined,
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
      active: boolean;
      logoUrl: string;
      privacyPolicyUrl: string;
      termsOfServiceUrl: string;
    }>,
  ) {
    await this.oauthClientRepository.update({ clientId }, data);
    const client = await this.oauthClientRepository.findOne({
      where: { clientId },
    });
    if (!client) return null;
    return {
      ...client,
      clientSecretHash: undefined,
      allowedScopes: Array.isArray(client.allowedScopes) ? client.allowedScopes : [],
      allowedGrants: Array.isArray(client.allowedGrants) ? client.allowedGrants : [],
      redirectUris: Array.isArray(client.redirectUris) ? client.redirectUris : [],
    };
  }

  async rotateClientSecret(clientId: string) {
    const client = await this.oauthClientRepository.findOne({
      where: { clientId },
    });

    if (!client) return null;

    // Generate new secret
    const newSecret = crypto.randomBytes(32).toString('base64url');
    const newSecretHash = await bcrypt.hash(newSecret, 10);

    // Update in database
    await this.oauthClientRepository.update(
      { clientId },
      { clientSecretHash: newSecretHash },
    );

    // Return the new secret (only shown once!)
    return {
      clientId,
      clientSecret: newSecret,
      message: 'Secret rotated successfully. Save this secret - it will not be shown again!',
    };
  }

  async deleteOAuthClient(clientId: string) {
    // Revoke all tokens for this client
    await this.refreshTokenRepository.update(
      { clientId },
      { revoked: true, revokedAt: new Date() },
    );

    // Delete client
    await this.oauthClientRepository.delete({ clientId });
    return { success: true };
  }

  // ==================== Stats ====================

  async getStats() {
    const totalUsers = await this.userRepository.count();
    const totalClients = await this.oauthClientRepository.count();
    const totalPasskeys = await this.passkeyRepository.count();
    const totalWallets = await this.walletRepository.count();
    const activeTokens = await this.refreshTokenRepository.count({
      where: { revoked: false },
    });

    // Users created in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentUsers = await this.userRepository.count({
      where: {
        createdAt: sevenDaysAgo as any, // TypeORM will handle the comparison
      },
    });

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

