import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityService } from './identity.service';
import { FieldCrypto } from '../common/field-crypto';
import * as bcrypt from 'bcryptjs';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';

@Injectable()
export class IdentityMfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityService: IdentityService,
    private readonly fieldCrypto: FieldCrypto,
  ) {}

  /**
   * Get security status for user
   */
  async getSecurityStatus(userId: string): Promise<{
    hasPassword: boolean;
    twoFactorEnabled: boolean;
    passkeysCount: number;
    walletsCount: number;
    emailVerified: boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
        twoFactorEnabled: true,
        emailVerified: true,
        passkeys: { select: { id: true } },
        wallets: { select: { id: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      hasPassword: !!user.passwordHash,
      twoFactorEnabled: user.twoFactorEnabled,
      passkeysCount: user.passkeys.length,
      walletsCount: user.wallets.length,
      emailVerified: user.emailVerified,
    };
  }

  /**
   * Setup 2FA - generate secret and QR code
   */
  async setup2FA(userId: string): Promise<{ secret: string; qrCode: string; otpauthUrl: string }> {
    const user = await this.identityService.getIdentityById(userId);

    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA is already enabled');
    }

    const secret = speakeasy.generateSecret({
      name: `INITE (${user.email})`,
      issuer: 'INITE Identity',
      length: 20,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: this.fieldCrypto.encrypt(secret.base32) },
    });

    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

    return {
      secret: secret.base32,
      qrCode,
      otpauthUrl: secret.otpauth_url!,
    };
  }

  /**
   * Enable 2FA after verifying code
   */
  async enable2FA(userId: string, code: string): Promise<{ success: boolean; backupCodes?: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, twoFactorSecret: true, twoFactorEnabled: true, metadata: true },
    });

    if (!user || !user.twoFactorSecret) {
      throw new BadRequestException('2FA not set up. Please run setup first.');
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA is already enabled');
    }

    const verified = speakeasy.totp.verify({
      secret: this.fieldCrypto.decrypt(user.twoFactorSecret),
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!verified) {
      throw new BadRequestException('Invalid verification code');
    }

    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        metadata: {
          ...(user.metadata as Record<string, unknown>),
          backupCodes: backupCodes.map(c => bcrypt.hashSync(c, 10)),
        } as Prisma.InputJsonValue,
      },
    });

    return { success: true, backupCodes };
  }

  /**
   * Disable 2FA
   */
  async disable2FA(userId: string, code: string, password: string): Promise<{ success: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.twoFactorEnabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    if (user.passwordHash) {
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        throw new UnauthorizedException('Invalid password');
      }
    }

    const verified = speakeasy.totp.verify({
      secret: this.fieldCrypto.decrypt(user.twoFactorSecret!),
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!verified) {
      throw new BadRequestException('Invalid 2FA code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });

    return { success: true };
  }

  /**
   * Verify 2FA code during login
   */
  async verify2FA(userId: string, code: string): Promise<{ verified: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, twoFactorSecret: true, twoFactorEnabled: true, metadata: true },
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA is not enabled for this user');
    }

    const verified = speakeasy.totp.verify({
      secret: this.fieldCrypto.decrypt(user.twoFactorSecret),
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (verified) {
      await this.reencryptIfLegacy(userId, user.twoFactorSecret);
      return { verified: true };
    }

    const meta = user.metadata as Record<string, unknown> | null;
    const rawCodes = meta?.['backupCodes'];
    const backupCodes: string[] = Array.isArray(rawCodes) ? rawCodes : [];
    for (let i = 0; i < backupCodes.length; i++) {
      const hashed = backupCodes[i];
      if (hashed && bcrypt.compareSync(code.toUpperCase(), hashed)) {
        backupCodes.splice(i, 1);
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            metadata: {
              ...(meta ?? {}),
              backupCodes,
            } as Prisma.InputJsonValue,
          },
        });
        return { verified: true };
      }
    }

    throw new BadRequestException('Invalid verification code');
  }

  /**
   * Lazy at-rest migration: a legacy plaintext 2FA secret gets re-written
   * encrypted the first time the user successfully verifies. No-op once the
   * value is already in the v1 envelope format.
   */
  private async reencryptIfLegacy(userId: string, stored: string): Promise<void> {
    if (FieldCrypto.isEncrypted(stored)) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: this.fieldCrypto.encrypt(stored) },
    });
  }
}
