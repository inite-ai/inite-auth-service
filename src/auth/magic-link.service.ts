import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import * as crypto from 'crypto';
import { MagicLink, User } from '../database/entities';
import { IdentityService } from '../identity/identity.service';

@Injectable()
export class MagicLinkService {
  constructor(
    @InjectRepository(MagicLink)
    private readonly magicLinkRepository: Repository<MagicLink>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly identityService: IdentityService,
  ) {}

  /**
   * Generate magic link token
   */
  async generateMagicLink(
    email: string,
    purpose: 'login' | 'register' | 'verify-email',
  ): Promise<string> {
    // Generate secure token
    const token = crypto.randomBytes(32).toString('base64url');

    // Set expiration (15 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    // Check if user exists
    const existingUser = await this.userRepository.findOne({ where: { email } });

    // Save magic link
    const magicLink = this.magicLinkRepository.create({
      token,
      email,
      userId: existingUser?.id,
      purpose,
      expiresAt,
      used: false,
    });

    await this.magicLinkRepository.save(magicLink);

    return token;
  }

  /**
   * Verify magic link token
   */
  async verifyMagicLink(token: string): Promise<{
    user: User;
    isNewUser: boolean;
  }> {
    const magicLink = await this.magicLinkRepository.findOne({
      where: { token, used: false },
    });

    if (!magicLink) {
      throw new BadRequestException('Invalid or expired magic link');
    }

    // Check expiration
    if (magicLink.expiresAt < new Date()) {
      throw new BadRequestException('Magic link expired');
    }

    // Mark as used
    magicLink.used = true;
    magicLink.usedAt = new Date();
    await this.magicLinkRepository.save(magicLink);

    let user: User;
    let isNewUser = false;

    // Check if user exists
    if (magicLink.userId) {
      user = await this.userRepository.findOne({
        where: { id: magicLink.userId },
      });
      if (!user) {
        throw new BadRequestException('User not found');
      }
    } else {
      // Create new user
      user = await this.identityService.createIdentity(magicLink.email);
      isNewUser = true;
    }

    // Mark email as verified
    if (!user.emailVerified) {
      user.emailVerified = true;
      await this.userRepository.save(user);
    }

    return { user, isNewUser };
  }

  /**
   * Cleanup expired magic links
   */
  async cleanupExpired(): Promise<void> {
    const now = new Date();
    await this.magicLinkRepository.delete({
      expiresAt: LessThan(now),
    });
  }
}



