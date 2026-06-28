import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { ethers } from 'ethers';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis.service';
import { IdentityService } from '../../identity/identity.service';
import { LoggerService } from '../../common/logger.service';

const NONCE_TTL_SECONDS = 300; // 5 minutes
const NONCE_PREFIX = 'siwe:login:';
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/**
 * Sign-In With Ethereum (EIP-4361) LOGIN factor — unauthenticated.
 *
 * SECURITY: this is an auth boundary. The recovered signer address is the ONLY
 * trusted identity; a client-supplied address is never authoritative. The
 * challenge nonce is single-use (atomic getDel) and TTL-bound, so a captured
 * signature cannot be replayed.
 */
@Injectable()
export class WalletAuthService {
  private readonly logger = new LoggerService();

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly identityService: IdentityService,
  ) {
    this.logger.setContext('WalletAuthService');
  }

  /** Issue a single-use EIP-4361 sign-in challenge for an EVM address. */
  async createSiweChallenge(
    address: string,
  ): Promise<{ message: string; nonce: string }> {
    if (!EVM_ADDRESS.test(address)) {
      throw new BadRequestException('Invalid Ethereum address');
    }
    const nonce = crypto.randomBytes(16).toString('hex');
    const message = this.buildLoginMessage(address, nonce);
    await this.redis.set(
      NONCE_PREFIX + nonce,
      address.toLowerCase(),
      NONCE_TTL_SECONDS,
    );
    return { message, nonce };
  }

  /** Verify a signed challenge and resolve (or JIT-create) the wallet's user. */
  async verifySiweLogin(
    message: string,
    signature: string,
  ): Promise<{ user: User; isNewUser: boolean }> {
    let recovered: string;
    try {
      recovered = ethers.verifyMessage(message, signature);
    } catch {
      throw new UnauthorizedException('Invalid signature');
    }

    const nonce = message.match(/Nonce: (\S+)/)?.[1];
    if (!nonce) throw new BadRequestException('Missing nonce');

    // Atomic read+delete → the nonce can only be redeemed once (replay guard).
    const boundAddr = await this.redis.getDel(NONCE_PREFIX + nonce);
    if (!boundAddr) {
      throw new UnauthorizedException('Challenge expired or already used');
    }
    if (boundAddr !== recovered.toLowerCase()) {
      throw new UnauthorizedException('Address mismatch');
    }
    this.assertDomain(message);

    return this.resolveOrCreateWalletUser(recovered, message, signature);
  }

  /** Build the EIP-4361 sign-IN message (distinct from wallet linking). */
  private buildLoginMessage(address: string, nonce: string): string {
    const domain = this.config.get<string>('RP_ID', 'localhost');
    const uri = this.config.get<string>('RP_ORIGIN', 'http://localhost:3000');
    const issuedAt = new Date().toISOString();
    return `${domain} wants you to sign in with your Ethereum account:
${address}

Sign in to your INITE identity.

URI: ${uri}
Version: 1
Chain ID: 1
Nonce: ${nonce}
Issued At: ${issuedAt}`;
  }

  /** Anti-phishing: the message must have been scoped to our RP domain. */
  private assertDomain(message: string): void {
    const domain = this.config.get<string>('RP_ID', 'localhost');
    if (!message.startsWith(domain)) {
      throw new UnauthorizedException('Domain mismatch');
    }
  }

  /**
   * Find the user owning this wallet, or JIT-create a wallet-only identity.
   * Addresses are stored/looked-up by the checksummed form ethers recovers,
   * keeping create + lookup on a single consistent normalization.
   */
  private async resolveOrCreateWalletUser(
    recovered: string,
    message: string,
    signature: string,
  ): Promise<{ user: User; isNewUser: boolean }> {
    // Store + look up lowercased to match the existing wallet-linking path
    // (identity.linkWallet uses address.toLowerCase()). The Wallet.address
    // column is @unique, so a casing mismatch would miss an already-linked
    // wallet and mint a duplicate identity.
    const address = recovered.toLowerCase();
    const existing = await this.prisma.wallet.findUnique({
      where: { address },
      include: { user: true },
    });
    if (existing) {
      return { user: existing.user, isNewUser: false };
    }

    const user = await this.identityService.createIdentity();
    await this.prisma.wallet.create({
      data: {
        userId: user.id,
        address,
        chain: 'eip155:1',
        signature,
        message,
      },
    });
    return { user, isNewUser: true };
  }
}
