import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from '../common/redis.service';
import { SettingsService } from '../common/settings/settings.service';
import { IdentityService } from './identity.service';
import { verifyTonProof, type TonProof } from './ton-proof';
import type { Wallet } from '@prisma/client';

/** Redis key holding the single-use ton_proof payload issued to a user. */
const PAYLOAD_KEY = (userId: string) => `ton:proof:payload:${userId}`;

/** How long an issued payload stays redeemable. */
const PAYLOAD_TTL_SECONDS = 300;

/** How stale a wallet's own proof timestamp may be. */
const PROOF_MAX_AGE_SECONDS = 300;

const PAYLOAD_BYTES = 32;

export interface LinkTonWalletInput {
  userId: string;
  address: string;
  publicKey: string;
  walletStateInit: string;
  proof: TonProof;
}

/**
 * TON wallet linking via TON Connect `ton_proof`.
 *
 * The previous flow could not work: the frontend asked the wallet for
 * nothing and posted `base64(message text)` as a signature, which the
 * server's Ed25519 check rejected every time — TON linking has never
 * actually succeeded. It also let the *client* choose the nonce, so even a
 * working signature would have been replayable.
 *
 * Here the nonce is minted server-side and consumed atomically, and the
 * proof is checked against the domain, its own freshness, and the
 * address-to-key binding (see ton-proof.ts).
 *
 * Gated on TON_WALLET_LINKING_ENABLED. The verification is unit-tested
 * against constructed wallets, but interop with real wallet state-init
 * layouts across TON wallet versions has not been exercised against live
 * wallets, so it ships off until that E2E pass is done — the same pattern
 * used for RAR/mTLS/SCIM/SAML.
 */
@Injectable()
export class TonWalletService {
  private readonly logger = new Logger(TonWalletService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
    private readonly identityService: IdentityService,
  ) {}

  private assertEnabled(): void {
    if (!this.settings.flag('TON_WALLET_LINKING_ENABLED')) {
      throw new BadRequestException('TON wallet linking is not enabled');
    }
  }

  /**
   * Mint the payload the wallet must sign.
   *
   * Server-generated and stored per user, so a proof captured elsewhere
   * carries a payload this server never issued and fails the check.
   */
  async issuePayload(userId: string): Promise<{ payload: string; expiresInSeconds: number }> {
    this.assertEnabled();

    const payload = randomBytes(PAYLOAD_BYTES).toString('hex');
    await this.redis.set(PAYLOAD_KEY(userId), payload, PAYLOAD_TTL_SECONDS);

    return { payload, expiresInSeconds: PAYLOAD_TTL_SECONDS };
  }

  /**
   * Verify a wallet's proof and link the address.
   *
   * The payload is consumed with getDel before verification, so a replay of
   * the same proof finds nothing to match against — one issued payload buys
   * exactly one attempt, successful or not.
   */
  async linkWithProof(input: LinkTonWalletInput): Promise<Wallet> {
    this.assertEnabled();
    await this.identityService.getIdentityById(input.userId);

    const expectedPayload = await this.redis.getDel(PAYLOAD_KEY(input.userId));
    if (!expectedPayload) {
      throw new BadRequestException('No pending TON proof request — start over');
    }

    const result = verifyTonProof({
      address: input.address,
      publicKey: input.publicKey,
      walletStateInit: input.walletStateInit,
      proof: input.proof,
      expectedDomain: this.settings.value('RP_ID', 'localhost'),
      expectedPayload,
      maxAgeSeconds: PROOF_MAX_AGE_SECONDS,
    });

    if (!result.valid) {
      // The precise reason is operator-facing only: telling a caller which
      // check failed hands them a tuning signal.
      this.logger.warn(`TON proof rejected for user ${input.userId}: ${result.reason}`);
      throw new BadRequestException('Invalid TON wallet proof');
    }

    return await this.identityService.persistWallet({
      userId: input.userId,
      // TON addresses are case-sensitive base64/raw forms — unlike EVM they
      // must not be lowercased.
      address: input.address,
      chain: 'ton',
      message: expectedPayload,
      signature: input.proof.signature,
    });
  }
}
