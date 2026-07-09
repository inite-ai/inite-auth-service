import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { OAuthClient, DeviceAuthorization } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * OAuth 2.0 Device Authorization Grant (RFC 8628).
 *
 * Three-step ceremony:
 *   1. Device calls POST /v1/oauth/device_authorization with
 *      client_id (+ optional scope). Server returns (device_code,
 *      user_code, verification_uri, interval, expires_in) and
 *      persists a row with status=pending.
 *   2. User visits verification_uri on a phone/laptop, types the
 *      8-character user_code, authenticates, approves. The frontend
 *      POSTs to /v1/oauth/device with the user_code under an
 *      authenticated session — we flip the row to status=approved.
 *   3. Device polls POST /v1/oauth/token with grant_type=
 *      urn:ietf:params:oauth:grant-type:device_code. We return:
 *        - authorization_pending while status==pending
 *        - slow_down if polled below interval
 *        - access_denied if status==denied
 *        - expired_token if past expiresAt
 *        - tokens once status==approved
 *
 * device_code is hashed at rest (SHA-256). The user_code is short
 * enough that we keep it plain so the user can type it.
 */
const USER_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'; // ambiguity-free
const DEFAULT_INTERVAL_SECONDS = 5;
const DEFAULT_TTL_SECONDS = 600; // 10 min
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

function hashDeviceCode(code: string): string {
  return createHash('sha256').update(code).digest('base64url');
}

function generateUserCode(): string {
  const pick = (n: number) => {
    const out: string[] = [];
    const bytes = randomBytes(n);
    for (let i = 0; i < n; i++) {
      // i < n === bytes.length and the modulo keeps the index within the
      // fixed 20-char alphabet, so both lookups are provably in range.
      const byte = bytes[i]!;
      out.push(USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]!);
    }
    return out.join('');
  };
  return `${pick(4)}-${pick(4)}`;
}

@Injectable()
export class DeviceFlowService {
  constructor(private readonly prisma: PrismaService) {}

  static readonly GRANT_TYPE = DEVICE_GRANT_TYPE;

  /**
   * Issue a fresh device_code / user_code pair for the device that
   * just called /device_authorization.
   */
  async issue(opts: {
    client: OAuthClient;
    scope?: string;
    verificationUri: string;
  }): Promise<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  }> {
    const deviceCode = randomBytes(40).toString('base64url');
    const deviceCodeHash = hashDeviceCode(deviceCode);
    const userCode = await this.uniqueUserCode();
    const expiresAt = new Date(Date.now() + DEFAULT_TTL_SECONDS * 1000);

    await this.prisma.deviceAuthorization.create({
      data: {
        deviceCodeHash,
        userCode,
        clientId: opts.client.clientId,
        scope: opts.scope ?? null,
        status: 'pending',
        expiresAt,
        interval: DEFAULT_INTERVAL_SECONDS,
      },
    });

    return {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: opts.verificationUri,
      verification_uri_complete: `${opts.verificationUri}?user_code=${userCode}`,
      expires_in: DEFAULT_TTL_SECONDS,
      interval: DEFAULT_INTERVAL_SECONDS,
    };
  }

  /**
   * Look up the row keyed by the human-typed user_code. Returns
   * null when not found / already approved / expired. Used by the
   * frontend after the user types the code, before showing the
   * consent screen.
   */
  async findByUserCode(userCode: string): Promise<DeviceAuthorization | null> {
    if (!userCode) return null;
    const normalised = userCode.trim().toUpperCase();
    const row = await this.prisma.deviceAuthorization.findUnique({
      where: { userCode: normalised },
    });
    if (!row) return null;
    if (row.expiresAt < new Date()) return null;
    return row;
  }

  /**
   * Flip a pending row to approved (or denied). Idempotent for the
   * same status — a double-click on the consent button doesn't
   * 500.
   */
  async approve(opts: {
    userCode: string;
    userId: string;
  }): Promise<DeviceAuthorization> {
    const normalised = opts.userCode.trim().toUpperCase();
    const row = await this.findByUserCode(normalised);
    if (!row) {
      throw new NotFoundException('Invalid or expired device code');
    }
    if (row.status === 'approved' && row.userId === opts.userId) {
      return row;
    }
    if (row.status !== 'pending') {
      throw new BadRequestException(`Device code is ${row.status}`);
    }
    return this.prisma.deviceAuthorization.update({
      where: { id: row.id },
      data: { status: 'approved', userId: opts.userId },
    });
  }

  async deny(userCode: string): Promise<void> {
    const row = await this.findByUserCode(userCode);
    if (!row) return;
    if (row.status !== 'pending') return;
    await this.prisma.deviceAuthorization.update({
      where: { id: row.id },
      data: { status: 'denied' },
    });
  }

  /**
   * /token polling path for grant_type=device_code. Returns the
   * matched row + the user record when approval is complete;
   * throws spec-shaped errors otherwise so the caller can return
   * them to the device verbatim.
   *
   * `error`/`error_description` are encoded as OAuth-style fields
   * inside BadRequestException's response so they reach the wire
   * intact.
   */
  async pollForApproval(opts: {
    deviceCode: string;
    clientId: string;
  }): Promise<DeviceAuthorization> {
    const deviceCodeHash = hashDeviceCode(opts.deviceCode);
    const row = await this.prisma.deviceAuthorization.findUnique({
      where: { deviceCodeHash },
    });
    if (!row || row.clientId !== opts.clientId) {
      // Spec wants 400 with error=expired_token / invalid_grant
      // depending on cause; we collapse unknown → invalid_grant.
      throw new BadRequestException({ error: 'invalid_grant' });
    }

    if (row.expiresAt < new Date()) {
      // Spec §3.5: device_code lifetime expired.
      await this.prisma.deviceAuthorization.update({
        where: { id: row.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException({ error: 'expired_token' });
    }

    // Enforce minimum poll interval. The spec says servers MAY tell
    // a too-eager poller `slow_down`; we do.
    const now = new Date();
    if (row.lastPolledAt) {
      const sinceLastMs = now.getTime() - row.lastPolledAt.getTime();
      if (sinceLastMs < row.interval * 1000) {
        await this.prisma.deviceAuthorization.update({
          where: { id: row.id },
          data: { lastPolledAt: now, interval: row.interval + 5 },
        });
        throw new BadRequestException({ error: 'slow_down' });
      }
    }
    await this.prisma.deviceAuthorization.update({
      where: { id: row.id },
      data: { lastPolledAt: now },
    });

    if (row.status === 'denied') {
      throw new BadRequestException({ error: 'access_denied' });
    }
    if (row.status === 'pending') {
      throw new BadRequestException({ error: 'authorization_pending' });
    }
    if (row.status !== 'approved' || !row.userId) {
      throw new BadRequestException({ error: 'invalid_grant' });
    }

    // Single-use: invalidate the device_code now so a successful
    // poll can't be replayed.
    await this.prisma.deviceAuthorization.delete({ where: { id: row.id } });

    return row;
  }

  private async uniqueUserCode(): Promise<string> {
    // Collisions on an 8-char alphabet of 20 chars are astronomically
    // rare (4 trillion-ish), but retry on the off chance.
    for (let i = 0; i < 5; i++) {
      const candidate = generateUserCode();
      const existing = await this.prisma.deviceAuthorization.findUnique({
        where: { userCode: candidate },
      });
      if (!existing) return candidate;
    }
    throw new Error('Failed to mint a unique device user_code');
  }
}
