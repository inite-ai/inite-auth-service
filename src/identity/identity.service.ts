import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User, Wallet, Passkey } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DidService, DidDocument, VerifiableCredential } from './did.service';
import { ethers } from 'ethers';

/** Input contract for IdentityService.linkWallet. */
export interface LinkWalletInput {
  userId: string;
  address: string;
  chain: string;
  message: string;
  signature: string;
  /** Required for TON wallet verification. */
  publicKey?: string;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly didService: DidService,
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
  async getIdentityById(id: string): Promise<User & { wallets?: Wallet[]; passkeys?: Passkey[] }> {
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
  async linkWallet(input: LinkWalletInput): Promise<Wallet> {
    const { userId, address, chain, message, signature } = input;
    await this.getIdentityById(userId);

    // TON goes through TonWalletService, which checks a real TON Connect
    // ton_proof. Accepting it here would mean verifying a signature over
    // prose the wallet never signs.
    if (chain === 'ton') {
      throw new BadRequestException('Link TON wallets via /wallet/ton/link');
    }

    if (!(await this.verifySiweSignature(message, signature, address))) {
      throw new BadRequestException('Invalid wallet signature');
    }

    return await this.persistWallet({
      userId,
      address: address.toLowerCase(),
      chain,
      message,
      signature,
    });
  }

  /**
   * Store a wallet whose ownership has already been proven.
   *
   * Shared by the SIWE path above and TonWalletService, so the
   * one-address-one-identity rule is enforced in a single place.
   */
  async persistWallet(input: {
    userId: string;
    address: string;
    chain: string;
    message: string;
    signature: string;
  }): Promise<Wallet> {
    const existingWallet = await this.prisma.wallet.findUnique({
      where: { address: input.address },
    });

    if (existingWallet) {
      if (existingWallet.userId === input.userId) {
        return existingWallet;
      }
      throw new BadRequestException('Wallet is already linked to another identity');
    }

    return await this.prisma.wallet.create({ data: { ...input } });
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
  async getDidDocument(userId: string): Promise<DidDocument> {
    const user = await this.getIdentityById(userId);
    return await this.didService.resolveDidDocument(user.did);
  }

  /**
   * Issue a Verifiable Credential to user
   */
  async issueCredential(
    userId: string,
    credentialType: string,
    claims: Record<string, unknown>,
  ): Promise<VerifiableCredential> {
    const user = await this.getIdentityById(userId);

    const issuerDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
    const issuerPrivateKey = process.env.ISSUER_PRIVATE_KEY || '';

    return await this.didService.issueVerifiableCredential({
      issuerDid,
      issuerPrivateKey,
      subjectDid: user.did,
      claims,
      credentialType,
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
    } catch {
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
}
