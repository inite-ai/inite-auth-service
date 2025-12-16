import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { User } from '../database/entities';
import { IdentityService } from '../identity/identity.service';
import { PasskeyService } from './passkey.service';
import { MagicLinkService } from './magic-link.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly identityService: IdentityService,
    private readonly passkeyService: PasskeyService,
    private readonly magicLinkService: MagicLinkService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

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
      select: ['id', 'did', 'email', 'emailVerified', 'name', 'avatarUrl', 'passwordHash'],
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
   */
  async sendMagicLink(email: string): Promise<void> {
    // Check if user exists
    const existingUser = await this.userRepository.findOne({ where: { email } });
    const purpose = existingUser ? 'login' : 'register';

    // Generate magic link
    const token = await this.magicLinkService.generateMagicLink(email, purpose);

    // TODO: Send email with magic link
    // For now, just log it
    console.log(`Magic link for ${email}: ${this.configService.get('RP_ORIGIN')}/auth/verify?token=${token}`);
  }

  /**
   * Verify magic link and authenticate
   */
  async verifyMagicLink(token: string): Promise<{
    user: User;
    accessToken: string;
    isNewUser: boolean;
  }> {
    const { user, isNewUser } = await this.magicLinkService.verifyMagicLink(token);
    const accessToken = this.generateAccessToken(user);

    return { user, accessToken, isNewUser };
  }

  /**
   * Validate user by ID
   */
  async validateUser(userId: string): Promise<User> {
    return await this.identityService.getIdentityById(userId);
  }

  /**
   * Generate JWT access token
   */
  private generateAccessToken(user: User): string {
    const payload = {
      sub: user.did,
      userId: user.id,
      email: user.email,
      email_verified: user.emailVerified,
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

