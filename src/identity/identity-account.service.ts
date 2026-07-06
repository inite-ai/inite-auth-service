import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { IdentityService } from './identity.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class IdentityAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly identityService: IdentityService,
  ) {}

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    data: { name?: string; avatarUrl?: string; bio?: string; location?: string; profession?: string },
  ): Promise<User> {
    await this.identityService.getIdentityById(userId);

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.profession !== undefined) updateData.profession = data.profession;

    return await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.passwordHash) {
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(newPassword)) {
      throw new BadRequestException('Password must contain at least one uppercase letter');
    }
    if (!/[0-9]/.test(newPassword)) {
      throw new BadRequestException('Password must contain at least one number');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Notify so the user has a compromise-recovery surface (the
    // email contains the password-reset link). Fire-and-forget: the
    // password is already changed; an SMTP hiccup should not roll it
    // back or 500 the request.
    this.emailService
      .sendPasswordChanged({
        email: user.email,
        name: user.name ?? undefined,
      })
      .catch(() => {
        /* logged inside EmailService */
      });
  }

  /**
   * Update user metadata
   */
  async updateMetadata(userId: string, metadata: Record<string, any>): Promise<User> {
    const user = await this.identityService.getIdentityById(userId);
    const { isAdmin, roles, ...safeMetadata } = metadata;
    return await this.prisma.user.update({
      where: { id: userId },
      data: { metadata: { ...user.metadata as any, ...safeMetadata } },
    });
  }

  /**
   * Export all user data
   */
  async exportUserData(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallets: true, passkeys: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      exportedAt: new Date().toISOString(),
      identity: {
        id: user.id,
        did: user.did,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.name,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        location: user.location,
        profession: user.profession,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      security: {
        twoFactorEnabled: user.twoFactorEnabled,
        passkeysCount: user.passkeys?.length || 0,
      },
      wallets: user.wallets?.map(w => ({
        address: w.address,
        chain: w.chain,
        linkedAt: w.linkedAt,
      })) || [],
      passkeys: user.passkeys?.map(p => ({
        id: p.id,
        deviceName: p.deviceName,
        deviceType: p.deviceType,
        createdAt: p.createdAt,
        lastUsedAt: p.lastUsedAt,
      })) || [],
    };
  }

  /**
   * Delete user account and all related data
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.passwordHash) {
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        throw new UnauthorizedException('Invalid password');
      }
    }

    // Cascade delete handles related records
    await this.prisma.user.delete({ where: { id: userId } });
  }
}
