import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthParamsDto } from '../common/dto/oauth-params.dto';
import { IdentityService } from '../identity/identity.service';
import { MagicLinkService } from './magic-link.service';
import { EmailService } from '../email/email.service';
import { LoggerService } from '../common/logger.service';
import { HibpService } from './hibp.service';
import { LoginSecurityService } from './login-security.service';

@Injectable()
export class AuthService {
  private readonly logger = new LoggerService();

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityService: IdentityService,
    private readonly magicLinkService: MagicLinkService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly hibp: HibpService,
    private readonly loginSecurity: LoginSecurityService,
  ) {
    this.logger.setContext('AuthService');
  }

  /**
   * Resolve a user's DID from their id. Returns null if the user
   * doesn't exist or has no DID. Lets controllers stay out of the
   * persistence layer (see eslint import/no-restricted-paths).
   */
  async getUserDid(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { did: true },
    });
    return user?.did ?? null;
  }

  /**
   * Throw if HIBP is enabled and the password is in the breach
   * corpus. Wraps the HibpService check so call sites read cleanly.
   */
  private async enforceHibp(password: string): Promise<void> {
    try {
      await this.hibp.assertNotBreached(password);
    } catch (err: any) {
      if (err?.code === 'password_breached') {
        throw new BadRequestException({
          error: 'password_breached',
          message: err.message,
          breach_count: err.breachCount,
        });
      }
      throw err;
    }
  }

  /**
   * Create user account for passkey registration (no password).
   *
   * SECURITY: this endpoint is unauthenticated and MUST NOT mint a session
   * for an already-existing email — that path was an account takeover
   * (anyone could log in as any user by passing allowExisting:true).
   * Existing users who want to add a passkey go through the authenticated
   * /auth/passkey/registration/options flow with their existing JWT/session.
   */
  async createUserForPasskey(
    email: string,
    name?: string,
  ): Promise<{ user: User; accessToken: string; isExistingUser: false }> {
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new BadRequestException(
        'User with this email already exists. Please sign in instead.',
      );
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

    // Reject passwords known to be in the HIBP breach corpus when
    // the operator enabled HIBP. No-op when disabled.
    await this.enforceHibp(password);

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
   * Login with email/password (legacy).
   *
   * Account lockout: tracks `failedLoginCount` and applies exponential
   * backoff after the 5th consecutive miss (1m → 5m → 15m → 1h → 24h).
   * The `lockoutUntil` check runs BEFORE bcrypt.compare so a locked
   * account does not leak the password-correctness bit. Counter resets
   * to 0 on any successful login.
   */
  async loginWithPassword(
    email: string,
    password: string,
  ): Promise<{ user: User; accessToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        did: true,
        email: true,
        emailVerified: true,
        name: true,
        avatarUrl: true,
        passwordHash: true,
        metadata: true,
        failedLoginCount: true,
        lockoutUntil: true,
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      const retryAfter = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 1000);
      this.logger.auth('Login blocked: account locked', { userId: user.id, retryAfter });
      this.loginSecurity.recordAttempt('locked');
      throw new UnauthorizedException(
        `Account temporarily locked. Try again in ${retryAfter}s.`,
      );
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      this.loginSecurity.recordAttempt('invalid');
      this.loginSecurity.auditLoginFailed(user.did);
      await this.loginSecurity.recordFailedLogin(user.id, user.failedLoginCount);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.failedLoginCount > 0 || user.lockoutUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockoutUntil: null },
      });
    }

    this.loginSecurity.recordAttempt('success');
    this.loginSecurity.auditLoginSuccess(user.did);
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

    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
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

    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
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

    await this.enforceHibp(newPassword);

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
    } catch {
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
