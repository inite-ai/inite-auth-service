import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, OAuthParamsDto } from '../database/entities';
import { IdentityService } from '../identity/identity.service';
import { PasskeyService } from './passkey.service';
import { MagicLinkService } from './magic-link.service';
import { EmailService } from '../email/email.service';
import { LoggerService } from '../common/logger.service';

@Injectable()
export class AuthService {
  private readonly logger = new LoggerService();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
   * @param email - User email
   * @param name - User name (optional)
   * @param allowExisting - If true, return existing user; if false, throw error if user exists
   */
  async createUserForPasskey(
    email: string,
    name?: string,
    allowExisting: boolean = false,
  ): Promise<{ user: User; accessToken: string }> {
    // Check if user exists
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      if (allowExisting) {
        // If user exists and we allow it, just return token (for login flow)
        const accessToken = this.generateAccessToken(existingUser);
        return { user: existingUser, accessToken };
      } else {
        // If user exists and we don't allow it, throw error (for registration flow)
        throw new BadRequestException('User with this email already exists. Please sign in instead.');
      }
    }

    // Create identity with DID
    const user = await this.identityService.createIdentity(email, name);
    
    // Mark email as verified since they're registering with passkey
    user.emailVerified = true;
    await this.userRepository.save(user);

    // Send welcome email
    try {
      const emailSent = await this.emailService.sendWelcome({ email: user.email, name: user.name });
      if (emailSent) {
        this.logger.auth('Welcome email sent', { email: user.email, userId: user.id });
      } else {
        this.logger.error('Failed to send welcome email', 'Email service returned false', { email: user.email, userId: user.id });
      }
    } catch (error: any) {
      // Log but don't fail registration if email fails
      this.logger.error('Failed to send welcome email', error?.message || 'Unknown error', { email: user.email, userId: user.id, error });
    }

    // Generate access token
    const accessToken = this.generateAccessToken(user);

    return { user, accessToken };
  }

  /**
   * Register with email/password (legacy)
   */
  async registerWithPassword(
    email: string,
    password: string,
    name?: string,
  ): Promise<{ user: User; accessToken: string }> {
    // Check if user exists
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    // Create identity with DID
    const user = await this.identityService.createIdentity(email, name);

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    user.passwordHash = passwordHash;
    await this.userRepository.save(user);

    // Send welcome email
    try {
      const emailSent = await this.emailService.sendWelcome({ email: user.email, name: user.name });
      if (emailSent) {
        this.logger.auth('Welcome email sent', { email: user.email, userId: user.id });
      } else {
        this.logger.error('Failed to send welcome email', 'Email service returned false', { email: user.email, userId: user.id });
      }
    } catch (error: any) {
      // Log but don't fail registration if email fails
      this.logger.error('Failed to send welcome email', error?.message || 'Unknown error', { email: user.email, userId: user.id, error });
    }

    // Generate access token
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
    const user = await this.userRepository.findOne({
      where: { email },
      select: ['id', 'did', 'email', 'emailVerified', 'name', 'avatarUrl', 'passwordHash', 'metadata'],
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate access token
    const accessToken = this.generateAccessToken(user);

    return { user, accessToken };
  }

  /**
   * Send magic link to email
   * @param email - User email
   * @param oauthParams - OAuth parameters to preserve for redirect after verification
   */
  async sendMagicLink(email: string, oauthParams?: OAuthParamsDto): Promise<void> {
    // Check if user exists
    const existingUser = await this.userRepository.findOne({ where: { email } });
    const purpose = existingUser ? 'login' : 'register';

    // Generate magic link with OAuth params preserved
    const token = await this.magicLinkService.generateMagicLink(email, purpose, oauthParams);

    // Build magic link URL - points to frontend /verify page, not API endpoint
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'https://auth.inite.ai');
    const magicLinkUrl = `${frontendUrl}/verify?token=${token}`;

    // Send email with magic link
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
    
    // Send welcome email if new user
    if (isNewUser) {
      try {
        const emailSent = await this.emailService.sendWelcome({ email: user.email, name: user.name });
        if (emailSent) {
          this.logger.auth('Welcome email sent', { email: user.email, userId: user.id });
        } else {
          this.logger.error('Failed to send welcome email', 'Email service returned false', { email: user.email, userId: user.id });
        }
      } catch (error: any) {
        // Log but don't fail authentication if email fails
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
    const user = await this.userRepository.findOne({ where: { email } });
    
    if (!user) {
      // Don't reveal if user exists for security
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('base64url');
    const resetExpires = new Date();
    resetExpires.setHours(resetExpires.getHours() + 1); // 1 hour expiry

    // Save reset token
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = resetExpires;
    await this.userRepository.save(user);

    // Build reset URL
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'https://auth.inite.ai');
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    // Send password reset email
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
    const user = await this.userRepository.findOne({
      where: { passwordResetToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid reset token');
    }

    if (!user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new BadRequestException('Reset token expired');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await this.userRepository.save(user);

    // Generate access token
    const accessToken = this.generateAccessToken(user);

    return { user, accessToken };
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
  private generateAccessToken(user: User): string {
    return this.generateTokenForUser(user);
  }

  /**
   * Generate JWT access token for user (public - for session-based auth)
   */
  generateTokenForUser(user: User): string {
    const payload = {
      sub: user.did,
      userId: user.id,
      email: user.email,
      email_verified: user.emailVerified,
      name: user.name,
      metadata: user.metadata,
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
}

