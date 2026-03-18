import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthParamsDto } from '../common/dto/oauth-params.dto';
import { IdentityService } from '../identity/identity.service';
import { PasskeyService } from './passkey.service';
import { MagicLinkService } from './magic-link.service';
import { EmailService } from '../email/email.service';
import { LoggerService } from '../common/logger.service';

@Injectable()
export class AuthService {
  private readonly logger = new LoggerService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly identityService: IdentityService,
    private readonly passkeyService: PasskeyService,
    private readonly magicLinkService: MagicLinkService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.logger.setContext('AuthService');
  }

  /**
   * Create user account for passkey registration (no password)
   */
  async createUserForPasskey(
    email: string,
    name?: string,
    allowExisting: boolean = false,
  ): Promise<{ user: User; accessToken: string; isExistingUser: boolean }> {
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      if (allowExisting) {
        const accessToken = this.generateAccessToken(existingUser);
        return { user: existingUser, accessToken, isExistingUser: true };
      } else {
        throw new BadRequestException('User with this email already exists. Please sign in instead.');
      }
    }

    let user = await this.identityService.createIdentity(email, name);

    user = await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    try {
      const emailSent = await this.emailService.sendWelcome({ email: user.email, name: user.name });
      if (emailSent) {
        this.logger.auth('Welcome email sent', { email: user.email, userId: user.id });
      } else {
        this.logger.error('Failed to send welcome email', 'Email service returned false', { email: user.email, userId: user.id });
      }
    } catch (error: any) {
      this.logger.error('Failed to send welcome email', error?.message || 'Unknown error', { email: user.email, userId: user.id, error });
    }

    const accessToken = this.generateAccessToken(user);
    return { user, accessToken, isExistingUser: false };
  }

  /**
   * Register with email/password (legacy)
   */
  async registerWithPassword(
    email: string,
    password: string,
    name?: string,
  ): Promise<{ user: User; accessToken: string }> {
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    let user = await this.identityService.createIdentity(email, name);

    const passwordHash = await bcrypt.hash(password, 10);
    user = await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    try {
      const emailSent = await this.emailService.sendWelcome({ email: user.email, name: user.name });
      if (emailSent) {
        this.logger.auth('Welcome email sent', { email: user.email, userId: user.id });
      } else {
        this.logger.error('Failed to send welcome email', 'Email service returned false', { email: user.email, userId: user.id });
      }
    } catch (error: any) {
      this.logger.error('Failed to send welcome email', error?.message || 'Unknown error', { email: user.email, userId: user.id, error });
    }

    const accessToken = this.generateAccessToken(user);
    return { user, accessToken };
  }

  /**
   * Login with email/password (legacy)
   */
  async loginWithPassword(
    email: string,
    password: string,
  ): Promise<{ user: User; accessToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, did: true, email: true, emailVerified: true, name: true, avatarUrl: true, passwordHash: true, metadata: true },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.generateAccessToken(user as any);
    return { user: user as any, accessToken };
  }

  /**
   * Send magic link to email
   */
  async sendMagicLink(email: string, oauthParams?: OAuthParamsDto): Promise<void> {
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    const purpose = existingUser ? 'login' : 'register';

    const token = await this.magicLinkService.generateMagicLink(email, purpose, oauthParams);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'https://auth.inite.ai');
    const magicLinkUrl = `${frontendUrl}/verify?token=${token}`;

    await this.emailService.sendMagicLink(email, magicLinkUrl, existingUser?.name);
  }

  /**
   * Verify magic link and authenticate
   */
  async verifyMagicLink(token: string): Promise<{
    user: User;
    accessToken: string;
    isNewUser: boolean;
    oauthParams: OAuthParamsDto | null;
  }> {
    const { user, isNewUser, oauthParams } = await this.magicLinkService.verifyMagicLink(token);

    if (isNewUser) {
      try {
        const emailSent = await this.emailService.sendWelcome({ email: user.email, name: user.name });
        if (emailSent) {
          this.logger.auth('Welcome email sent', { email: user.email, userId: user.id });
        } else {
          this.logger.error('Failed to send welcome email', 'Email service returned false', { email: user.email, userId: user.id });
        }
      } catch (error: any) {
        this.logger.error('Failed to send welcome email', error?.message || 'Unknown error', { email: user.email, userId: user.id, error });
      }
    }

    const accessToken = this.generateAccessToken(user);
    return { user, accessToken, isNewUser, oauthParams };
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) return;

    const resetToken = crypto.randomBytes(32).toString('base64url');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetExpires = new Date();
    resetExpires.setHours(resetExpires.getHours() + 1);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetTokenHash,
        passwordResetExpires: resetExpires,
      },
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'https://auth.inite.ai');
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    await this.emailService.sendPasswordReset(
      { email: user.email, name: user.name },
      resetUrl,
    );
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<{
    user: User;
    accessToken: string;
  }> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.user.findFirst({
      where: { passwordResetToken: tokenHash },
    });

    if (!user) {
      throw new BadRequestException('Invalid reset token');
    }

    if (!user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new BadRequestException('Reset token expired');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    const accessToken = this.generateAccessToken(updated);
    return { user: updated, accessToken };
  }

  /**
   * Validate user by ID
   */
  async validateUser(userId: string): Promise<User> {
    return await this.identityService.getIdentityById(userId);
  }

  /**
   * Generate JWT access token (internal)
   */
  private generateAccessToken(user: Pick<User, 'id' | 'did' | 'email' | 'emailVerified' | 'name'>): string {
    return this.generateTokenForUser(user);
  }

  /**
   * Generate JWT access token for user (public - for session-based auth)
   */
  generateTokenForUser(user: Pick<User, 'id' | 'did' | 'email' | 'emailVerified' | 'name'>): string {
    const payload = {
      sub: user.did,
      userId: user.id,
      email: user.email,
      email_verified: user.emailVerified,
      name: user.name,
    };

    return this.jwtService.sign(payload, {
      expiresIn: '1h',
    });
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token: string): Promise<any> {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * If login is from a new device, record it and send "new device" email.
   */
  async notifyNewDeviceIfNeeded(
    userId: string,
    opts: { userAgent?: string; ip?: string },
  ): Promise<void> {
    const raw = [opts.userAgent || '', opts.ip || ''].join('|');
    if (!raw.trim()) return;

    const fingerprint = crypto.createHash('sha256').update(raw).digest('hex');

    const existing = await this.prisma.userKnownDevice.findUnique({
      where: { userId_fingerprint: { userId, fingerprint } },
    });
    if (existing) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user?.email) return;

    await this.prisma.userKnownDevice.create({
      data: { userId, fingerprint },
    });

    const deviceInfo = opts.userAgent
      ? opts.userAgent.replace(/\s+/g, ' ').slice(0, 120)
      : undefined;

    try {
      const sent = await this.emailService.sendNewDeviceLogin(
        { email: user.email, name: user.name },
        deviceInfo,
      );
      if (sent) {
        this.logger.auth('New device login email sent', { userId, email: user.email });
      }
    } catch (error: any) {
      this.logger.error('Failed to send new device email', error?.message, { userId });
    }
  }
}
