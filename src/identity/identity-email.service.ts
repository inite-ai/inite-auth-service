import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { IdentityService } from './identity.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

@Injectable()
export class IdentityEmailService {
  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly identityService: IdentityService,
  ) {}

  /**
   * Request email change
   */
  async requestEmailChange(userId: string, newEmail: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, passwordHash: true },
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

    const existingUser = await this.prisma.user.findUnique({ where: { email: newEmail } });
    if (existingUser) {
      throw new BadRequestException('Email is already in use');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    const fullUser = await this.identityService.getIdentityById(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        metadata: {
          ...fullUser.metadata as any,
          pendingEmailChange: {
            newEmail,
            token,
            expires: expires.toISOString(),
          },
        },
      },
    });

    const rpOrigin = this.configService.get('RP_ORIGIN') || 'http://localhost:3000';
    const verificationLink = `${rpOrigin}/verify-email?token=${token}&type=change`;
    await this.emailService.sendEmailChangeVerification(newEmail, user.email, verificationLink);
  }

  /**
   * Resend email verification
   */
  async resendEmailVerification(userId: string): Promise<void> {
    const user = await this.identityService.getIdentityById(userId);

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationToken: token,
        emailVerificationExpires: expires,
      },
    });

    const rpOrigin = this.configService.get('RP_ORIGIN') || 'http://localhost:3000';
    const verificationLink = `${rpOrigin}/verify-email?token=${token}`;
    await this.emailService.sendEmailVerification(user.email, verificationLink);
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
    // Regular email verification
    const user = await this.prisma.user.findFirst({
      where: { emailVerificationToken: token },
    });

    if (user) {
      if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
        throw new BadRequestException('Verification link has expired');
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null,
        },
      });

      return { success: true, message: 'Email verified successfully' };
    }

    // Email change verification via JSONB query
    const emailChangeUser = await this.prisma.user.findFirst({
      where: {
        metadata: {
          path: ['pendingEmailChange', 'token'],
          equals: token,
        },
      },
    });

    if (emailChangeUser) {
      const pending = (emailChangeUser.metadata as any)?.pendingEmailChange;
      if (pending && new Date(pending.expires) < new Date()) {
        throw new BadRequestException('Verification link has expired');
      }

      await this.prisma.user.update({
        where: { id: emailChangeUser.id },
        data: {
          email: pending.newEmail,
          emailVerified: true,
          metadata: {
            ...emailChangeUser.metadata as any,
            pendingEmailChange: null,
          },
        },
      });

      return { success: true, message: 'Email changed successfully' };
    }

    throw new BadRequestException('Invalid verification token');
  }
}
