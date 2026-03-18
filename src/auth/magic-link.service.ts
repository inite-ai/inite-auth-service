import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthParamsDto } from '../common/dto/oauth-params.dto';
import { IdentityService } from '../identity/identity.service';
import { User } from '@prisma/client';

@Injectable()
export class MagicLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityService: IdentityService,
  ) {}

  /**
   * Generate magic link token
   */
  async generateMagicLink(
    email: string,
    purpose: 'login' | 'register' | 'verify-email',
    oauthParams?: OAuthParamsDto,
  ): Promise<string> {
    const token = crypto.randomBytes(32).toString('base64url');

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    const existingUser = await this.prisma.user.findUnique({ where: { email } });

    await this.prisma.magicLink.create({
      data: {
        token,
        email,
        userId: existingUser?.id,
        purpose,
        expiresAt,
        used: false,
        oauthParams: oauthParams?.clientId ? (oauthParams as any) : null,
      },
    });

    return token;
  }

  /**
   * Verify magic link token
   */
  async verifyMagicLink(token: string): Promise<{
    user: User;
    isNewUser: boolean;
    oauthParams: OAuthParamsDto | null;
  }> {
    const magicLink = await this.prisma.magicLink.findFirst({
      where: { token, used: false },
    });

    if (!magicLink) {
      throw new BadRequestException('Invalid or expired magic link');
    }

    if (magicLink.expiresAt < new Date()) {
      throw new BadRequestException('Magic link expired');
    }

    await this.prisma.magicLink.update({
      where: { id: magicLink.id },
      data: { used: true, usedAt: new Date() },
    });

    let user: User;
    let isNewUser = false;

    if (magicLink.userId) {
      const found = await this.prisma.user.findUnique({
        where: { id: magicLink.userId },
      });
      if (!found) {
        throw new BadRequestException('User not found');
      }
      user = found;
    } else {
      user = await this.identityService.createIdentity(magicLink.email);
      isNewUser = true;
    }

    if (!user.emailVerified) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
    }

    return { user, isNewUser, oauthParams: magicLink.oauthParams as OAuthParamsDto | null };
  }

  private readonly logger = new Logger(MagicLinkService.name);

  /**
   * Cleanup expired magic links — runs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpired(): Promise<void> {
    const { count } = await this.prisma.magicLink.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (count) {
      this.logger.log(`Deleted ${count} expired magic links`);
    }
  }
}
