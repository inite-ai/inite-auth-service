import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User, Wallet } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DidService } from './did.service';
import { EmailService } from '../email/email.service';
import { ethers } from 'ethers';
import * as bcrypt from 'bcryptjs';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import * as nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';

@Injectable()
export class IdentityService {
  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly prisma: PrismaService,
    private readonly didService: DidService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a new identity with DID.
   *
   * SECURITY: the DID private key is intentionally NOT persisted. The
   * server never signs anything on behalf of the user with this key
   * (credential issuance uses ISSUER_PRIVATE_KEY from env, not the user's
   * key — see issueCredential). Storing user privkeys plaintext in JSONB
   * was a critical data-leak liability with no upside. If client-side
   * signing is ever needed, generate the keypair in the browser/wallet
   * and only send the public key here.
   */
  async createIdentity(email?: string, name?: string): Promise<User> {
    const { did, publicKey } = await this.didService.generateDid();

    return await this.prisma.user.create({
      data: {
        did,
        email,
        name,
        emailVerified: false,
        metadata: {
          didPublicKey: publicKey,
        },
      },
    });
  }

  /**
   * Get user identity by DID
   */
  async getIdentityByDid(did: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { did } });
    if (!user) {
      throw new NotFoundException('Identity not found');
    }
    return user;
  }

  /**
   * Get user identity by email
   */
  async getIdentityByEmail(email: string): Promise<User | null> {
    return await this.prisma.user.findUnique({ where: { email } });
  }

  /**
   * Get user identity by ID
   */
  async getIdentityById(id: string): Promise<User & { wallets?: Wallet[]; passkeys?: any[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { wallets: true, passkeys: true },
    });
    if (!user) {
      throw new NotFoundException('Identity not found');
    }
    return user;
  }

  /**
   * Link wallet to identity
   */
  // eslint-disable-next-line max-params -- TODO(par-max): pass an options object / contract
  async linkWallet(
    userId: string,
    address: string,
    chain: string,
    message: string,
    signature: string,
    publicKey?: string,
  ): Promise<Wallet> {
    await this.getIdentityById(userId);

    let isValid = false;
    if (chain === 'ton') {
      if (!publicKey) {
        throw new BadRequestException('Public key is required for TON wallet verification');
      }
      isValid = await this.verifyTonSignature(message, signature, publicKey);
    } else {
      isValid = await this.verifySiweSignature(message, signature, address);
    }

    if (!isValid) {
      throw new BadRequestException('Invalid wallet signature');
    }

    const normalizedAddress = chain === 'ton' ? address : address.toLowerCase();

    const existingWallet = await this.prisma.wallet.findUnique({
      where: { address: normalizedAddress },
    });

    if (existingWallet) {
      if (existingWallet.userId === userId) {
        return existingWallet;
      }
      throw new BadRequestException('Wallet is already linked to another identity');
    }

    return await this.prisma.wallet.create({
      data: {
        userId,
        address: normalizedAddress,
        chain,
        signature,
        message,
      },
    });
  }

  /**
   * Unlink wallet from identity
   */
  async unlinkWallet(userId: string, walletId: string): Promise<void> {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found or not owned by user');
    }

    await this.prisma.wallet.delete({ where: { id: walletId } });
  }

  /**
   * Get all wallets for a user
   */
  async getWallets(userId: string): Promise<Wallet[]> {
    return await this.prisma.wallet.findMany({ where: { userId } });
  }

  /**
   * Get DID document for user
   */
  async getDidDocument(userId: string): Promise<any> {
    const user = await this.getIdentityById(userId);
    return await this.didService.resolveDidDocument(user.did);
  }

  /**
   * Issue a Verifiable Credential to user
   */
  async issueCredential(
    userId: string,
    credentialType: string,
    claims: Record<string, any>,
  ): Promise<any> {
    const user = await this.getIdentityById(userId);

    const issuerDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
    const issuerPrivateKey = process.env.ISSUER_PRIVATE_KEY || '';

    return await this.didService.issueVerifiableCredential(
      issuerDid,
      issuerPrivateKey,
      user.did,
      claims,
      credentialType,
    );
  }

  /**
   * Update user metadata
   */
  async updateMetadata(userId: string, metadata: Record<string, any>): Promise<User> {
    const user = await this.getIdentityById(userId);
    const { isAdmin, roles, ...safeMetadata } = metadata;
    return await this.prisma.user.update({
      where: { id: userId },
      data: { metadata: { ...user.metadata as any, ...safeMetadata } },
    });
  }

  /**
   * Verify SIWE (Sign-In With Ethereum) signature
   */
  private async verifySiweSignature(
    message: string,
    signature: string,
    expectedAddress: string,
  ): Promise<boolean> {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate SIWE message for wallet linking
   */
  generateSiweMessage(
    address: string,
    did: string,
    nonce: string,
  ): string {
    const domain = this.configService.get<string>('RP_ID', 'localhost');
    const uri = this.configService.get<string>('RP_ORIGIN', 'http://localhost:3000');
    const issuedAt = new Date().toISOString();

    return `${domain} wants you to sign in with your Ethereum account:
${address}

Link this wallet to your INITE identity.

DID: ${did}
URI: ${uri}
Nonce: ${nonce}
Issued At: ${issuedAt}`;
  }

  /**
   * Generate TON proof message for wallet linking
   */
  generateTonMessage(
    address: string,
    did: string,
    nonce: string,
  ): { message: string; payload: string } {
    const domain = this.configService.get<string>('RP_ID', 'localhost');
    const timestamp = Math.floor(Date.now() / 1000);

    const payload = JSON.stringify({
      type: 'ton_proof',
      domain,
      address,
      did,
      nonce,
      timestamp,
    });

    const message = `Link this TON wallet to your INITE identity.\n\nAddress: ${address}\nDID: ${did}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

    return { message, payload };
  }

  /**
   * Verify TON signature using ed25519
   */
  private async verifyTonSignature(
    message: string,
    signature: string,
    publicKey: string,
  ): Promise<boolean> {
    try {
      const signatureBytes = naclUtil.decodeBase64(signature);
      const publicKeyBytes = naclUtil.decodeBase64(publicKey);
      const messageBytes = naclUtil.decodeUTF8(message);

      return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch {
      return false;
    }
  }

  // ==================== Profile Management ====================

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    data: { name?: string; avatarUrl?: string; bio?: string; location?: string; profession?: string },
  ): Promise<User> {
    await this.getIdentityById(userId);

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

  // ==================== 2FA Management ====================

  /**
   * Setup 2FA - generate secret and QR code
   */
  async setup2FA(userId: string): Promise<{ secret: string; qrCode: string; otpauthUrl: string }> {
    const user = await this.getIdentityById(userId);

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
      data: { twoFactorSecret: secret.base32 },
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
      secret: user.twoFactorSecret,
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
          ...user.metadata as any,
          backupCodes: backupCodes.map(c => bcrypt.hashSync(c, 10)),
        },
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
      secret: user.twoFactorSecret!,
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
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (verified) {
      return { verified: true };
    }

    const backupCodes = (user.metadata as any)?.backupCodes || [];
    for (let i = 0; i < backupCodes.length; i++) {
      if (bcrypt.compareSync(code.toUpperCase(), backupCodes[i])) {
        backupCodes.splice(i, 1);
        await this.prisma.user.update({
          where: { id: userId },
          data: { metadata: { ...user.metadata as any, backupCodes } },
        });
        return { verified: true };
      }
    }

    throw new BadRequestException('Invalid verification code');
  }

  // ==================== Data Export & Account Deletion ====================

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

  // ==================== Email Verification ====================

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

    const fullUser = await this.getIdentityById(userId);
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
    const user = await this.getIdentityById(userId);

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
