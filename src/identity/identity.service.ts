import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, Wallet, Passkey } from '../database/entities';
import { DidService } from './did.service';
import { ethers } from 'ethers';
import * as bcrypt from 'bcryptjs';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';

@Injectable()
export class IdentityService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly didService: DidService,
  ) {}

  /**
   * Create a new identity with DID
   */
  async createIdentity(email?: string, name?: string): Promise<User> {
    // Generate DID
    const { did, publicKey, privateKey } = await this.didService.generateDid();

    const user = this.userRepository.create({
      did,
      email,
      name,
      emailVerified: false,
      metadata: {
        didPublicKey: publicKey,
        didPrivateKey: privateKey, // In production, store this securely or let user manage it
      },
    });

    return await this.userRepository.save(user);
  }

  /**
   * Get user identity by DID
   */
  async getIdentityByDid(did: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { did } });
    if (!user) {
      throw new NotFoundException('Identity not found');
    }
    return user;
  }

  /**
   * Get user identity by email
   */
  async getIdentityByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOne({ where: { email } });
  }

  /**
   * Get user identity by ID
   */
  async getIdentityById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['wallets', 'passkeys'],
    });
    if (!user) {
      throw new NotFoundException('Identity not found');
    }
    return user;
  }

  /**
   * Link wallet to identity using SIWE (Sign-In With Ethereum)
   */
  async linkWallet(
    userId: string,
    address: string,
    chain: string,
    message: string,
    signature: string,
  ): Promise<Wallet> {
    const user = await this.getIdentityById(userId);

    // Verify SIWE signature
    const isValid = await this.verifySiweSignature(message, signature, address);
    if (!isValid) {
      throw new BadRequestException('Invalid wallet signature');
    }

    // Check if wallet is already linked
    const existingWallet = await this.walletRepository.findOne({
      where: { address: address.toLowerCase() },
    });

    if (existingWallet) {
      if (existingWallet.userId === userId) {
        return existingWallet;
      }
      throw new BadRequestException('Wallet is already linked to another identity');
    }

    // Create wallet link
    const wallet = this.walletRepository.create({
      userId,
      address: address.toLowerCase(),
      chain,
      signature,
      message,
    });

    return await this.walletRepository.save(wallet);
  }

  /**
   * Unlink wallet from identity
   */
  async unlinkWallet(userId: string, walletId: string): Promise<void> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found or not owned by user');
    }

    await this.walletRepository.remove(wallet);
  }

  /**
   * Get all wallets for a user
   */
  async getWallets(userId: string): Promise<Wallet[]> {
    return await this.walletRepository.find({ where: { userId } });
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

    // Get issuer DID and private key (should be service's own DID)
    // In production, this should be a dedicated issuer service
    const issuerDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'; // Example issuer DID
    const issuerPrivateKey = process.env.ISSUER_PRIVATE_KEY || ''; // Should be securely stored

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
    user.metadata = { ...user.metadata, ...metadata };
    return await this.userRepository.save(user);
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
    const domain = 'auth.inite.ai';
    const uri = 'https://auth.inite.ai';
    const issuedAt = new Date().toISOString();

    return `${domain} wants you to sign in with your Ethereum account:
${address}

Link this wallet to your INITE identity.

DID: ${did}
URI: ${uri}
Nonce: ${nonce}
Issued At: ${issuedAt}`;
  }

  // ==================== Profile Management ====================

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    data: { name?: string; avatarUrl?: string; bio?: string; location?: string; profession?: string },
  ): Promise<User> {
    const user = await this.getIdentityById(userId);
    
    if (data.name !== undefined) user.name = data.name;
    if (data.avatarUrl !== undefined) user.avatarUrl = data.avatarUrl;
    if (data.bio !== undefined) user.bio = data.bio;
    if (data.location !== undefined) user.location = data.location;
    if (data.profession !== undefined) user.profession = data.profession;
    
    return await this.userRepository.save(user);
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'passwordHash'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // If user has a password, verify current password
    if (user.passwordHash) {
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    // Validate new password
    if (newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }

    // Hash and save new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepository.update(userId, { passwordHash: newPasswordHash });
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
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'passwordHash', 'twoFactorEnabled', 'emailVerified'],
      relations: ['passkeys', 'wallets'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      hasPassword: !!user.passwordHash,
      twoFactorEnabled: user.twoFactorEnabled,
      passkeysCount: user.passkeys?.length || 0,
      walletsCount: user.wallets?.length || 0,
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

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `INITE (${user.email})`,
      issuer: 'INITE Identity',
      length: 20,
    });

    // Save secret temporarily (not enabled yet)
    await this.userRepository.update(userId, {
      twoFactorSecret: secret.base32,
    });

    // Generate QR code
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
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'twoFactorSecret', 'twoFactorEnabled'],
    });

    if (!user || !user.twoFactorSecret) {
      throw new BadRequestException('2FA not set up. Please run setup first.');
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA is already enabled');
    }

    // Verify the code
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!verified) {
      throw new BadRequestException('Invalid verification code');
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () =>
      Math.random().toString(36).substring(2, 8).toUpperCase()
    );

    // Enable 2FA
    await this.userRepository.update(userId, {
      twoFactorEnabled: true,
      metadata: {
        ...(await this.getIdentityById(userId)).metadata,
        backupCodes: backupCodes.map(c => bcrypt.hashSync(c, 10)),
      },
    });

    return { success: true, backupCodes };
  }

  /**
   * Disable 2FA
   */
  async disable2FA(userId: string, code: string, password: string): Promise<{ success: boolean }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'passwordHash', 'twoFactorSecret', 'twoFactorEnabled'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.twoFactorEnabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    // Verify password
    if (user.passwordHash) {
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        throw new UnauthorizedException('Invalid password');
      }
    }

    // Verify 2FA code
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!verified) {
      throw new BadRequestException('Invalid 2FA code');
    }

    // Disable 2FA
    await this.userRepository.update(userId, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });

    return { success: true };
  }

  /**
   * Verify 2FA code during login
   */
  async verify2FA(userId: string, code: string): Promise<{ verified: boolean }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'twoFactorSecret', 'twoFactorEnabled', 'metadata'],
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA is not enabled for this user');
    }

    // First try TOTP
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (verified) {
      return { verified: true };
    }

    // Try backup codes
    const backupCodes = user.metadata?.backupCodes || [];
    for (let i = 0; i < backupCodes.length; i++) {
      if (bcrypt.compareSync(code.toUpperCase(), backupCodes[i])) {
        // Remove used backup code
        backupCodes.splice(i, 1);
        await this.userRepository.update(userId, {
          metadata: { ...user.metadata, backupCodes },
        });
        return { verified: true };
      }
    }

    throw new BadRequestException('Invalid verification code');
  }
}



