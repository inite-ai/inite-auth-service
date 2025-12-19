import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
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
    const [users, total] = await this.userRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
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
      clientSecret: undefined, // Don't expose secrets
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
      clientSecret: undefined,
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
    clientSecret: string;
    redirectUris: string[];
    allowedScopes?: string[];
  }) {
    const client = this.oauthClientRepository.create({
      ...data,
      allowedScopes: data.allowedScopes || ['openid', 'profile', 'email'],
    });

    await this.oauthClientRepository.save(client);
    return { ...client, clientSecret: undefined };
  }

  async updateOAuthClient(
    clientId: string,
    data: Partial<{
      name: string;
      redirectUris: string[];
      allowedScopes: string[];
      isActive: boolean;
    }>,
  ) {
    await this.oauthClientRepository.update({ clientId }, data);
    const client = await this.oauthClientRepository.findOne({
      where: { clientId },
    });
    return client ? { ...client, clientSecret: undefined } : null;
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

