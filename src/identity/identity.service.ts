import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, Wallet } from '../database/entities';
import { DidService } from './did.service';
import { ethers } from 'ethers';

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
}


