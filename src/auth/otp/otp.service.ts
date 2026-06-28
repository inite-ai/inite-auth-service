import {
  Injectable,
  Inject,
  BadRequestException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis.service';
import { EmailService } from '../../email/email.service';
import { IdentityService } from '../../identity/identity.service';
import { LoggerService } from '../../common/logger.service';
import { SMS_PROVIDER, SmsProvider } from './sms/sms-provider.interface';

export type OtpChannel = 'email' | 'sms';
export type OtpPurpose = 'login' | 'mfa';

const CODE_TTL_SECONDS = 600; // 10 minutes
const MAX_ATTEMPTS = 5; // wrong tries before the code is burned
const COOLDOWN_SECONDS = 30; // min gap between sends to one subject
const MAX_SENDS_PER_HOUR = 6; // hard cap per subject per rolling hour

interface OtpRecord {
  codeHash: string;
  attempts: number;
  expiresAt: number;
}

/**
 * Email/SMS one-time-passcode factor. Codes are 6 digits, stored only as a
 * SHA-256 hash in Redis, single-use, attempt-limited, rate-limited and
 * time-boxed. Used both as a primary login factor (channel email, purpose
 * login) and as a step-up second factor (purpose mfa).
 */
@Injectable()
export class OtpService {
  private readonly logger = new LoggerService();

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly email: EmailService,
    private readonly identityService: IdentityService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {
    this.logger.setContext('OtpService');
  }

  /** Whether the SMS channel is usable (provider configured). */
  get smsEnabled(): boolean {
    return this.sms.enabled;
  }

  // ───────────────────────────── login factor ─────────────────────────────

  /** Send a login code to an email address. Generic by design (no account
   *  enumeration — the caller always returns the same response). */
  async requestEmailLoginCode(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { name: true },
    });
    await this.generateAndSend({
      subject: `login:email:${email.toLowerCase()}`,
      channel: 'email',
      sendTo: email,
      name: user?.name ?? undefined,
    });
  }

  /** Verify a login code and resolve (or JIT-create) the user. */
  async verifyEmailLoginCode(
    email: string,
    code: string,
  ): Promise<{ user: User; isNewUser: boolean }> {
    await this.verify(`login:email:${email.toLowerCase()}`, code);
    return this.resolveOrCreateUser(email);
  }

  // ─────────────────────────── step-up (MFA) factor ───────────────────────

  /** Send a step-up code to an already-authenticated user. */
  async requestMfaCode(
    userId: string,
    channel: OtpChannel,
    phone?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    if (channel === 'email') {
      if (!user.email) throw new BadRequestException('User has no email on file');
      await this.generateAndSend({
        subject: `mfa:${userId}`,
        channel: 'email',
        sendTo: user.email,
        name: user.name ?? undefined,
      });
      return;
    }

    if (!phone) throw new BadRequestException('Phone number required for SMS');
    await this.generateAndSend({
      subject: `mfa:${userId}`,
      channel: 'sms',
      sendTo: phone,
    });
  }

  /** Verify a step-up code for an authenticated user. */
  async verifyMfaCode(userId: string, code: string): Promise<boolean> {
    await this.verify(`mfa:${userId}`, code);
    return true;
  }

  // ──────────────────────────────── core ──────────────────────────────────

  private async generateAndSend(opts: {
    subject: string;
    channel: OtpChannel;
    sendTo: string;
    name?: string;
  }): Promise<void> {
    if (opts.channel === 'sms' && !this.sms.enabled) {
      throw new BadRequestException('SMS channel is not configured');
    }

    await this.enforceRateLimits(opts.subject);

    // 6-digit code, uniformly random. randomInt is rejection-sampled so no
    // modulo bias. Stored only as a hash.
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const record: OtpRecord = {
      codeHash: this.hash(code),
      attempts: 0,
      expiresAt: Date.now() + CODE_TTL_SECONDS * 1000,
    };
    await this.redis.set(
      this.codeKey(opts.subject),
      JSON.stringify(record),
      CODE_TTL_SECONDS,
    );

    const ttlMinutes = Math.round(CODE_TTL_SECONDS / 60);
    const sent =
      opts.channel === 'email'
        ? await this.email.sendOtpCode(opts.sendTo, code, {
            ttlMinutes,
            name: opts.name,
          })
        : await this.sms.send(
            opts.sendTo,
            `Your INITE verification code is ${code}. It expires in ${ttlMinutes} minutes.`,
          );

    if (!sent) {
      // Don't leak delivery failure to the client (enumeration), but record it.
      this.logger.warn(`OTP ${opts.channel} delivery returned false`);
    }
  }

  private async verify(subject: string, code: string): Promise<void> {
    const key = this.codeKey(subject);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    const record: OtpRecord = JSON.parse(raw);

    if (record.expiresAt <= Date.now()) {
      await this.redis.del(key);
      throw new UnauthorizedException('Invalid or expired code');
    }

    if (this.timingSafeEqualHex(record.codeHash, this.hash(code))) {
      await this.redis.del(key); // single-use: burn on success
      return;
    }

    const attempts = record.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await this.redis.del(key); // burn after too many misses → must re-request
      throw new UnauthorizedException(
        'Too many incorrect attempts. Request a new code.',
      );
    }
    const remainingTtl = Math.max(
      1,
      Math.ceil((record.expiresAt - Date.now()) / 1000),
    );
    await this.redis.set(
      key,
      JSON.stringify({ ...record, attempts }),
      remainingTtl,
    );
    throw new UnauthorizedException('Invalid or expired code');
  }

  /** Cooldown (one send / COOLDOWN_SECONDS) + rolling hourly cap per subject. */
  private async enforceRateLimits(subject: string): Promise<void> {
    const fresh = await this.redis.setIfAbsent(
      this.cooldownKey(subject),
      '1',
      COOLDOWN_SECONDS,
    );
    if (!fresh) {
      throw new HttpException(
        'Please wait before requesting another code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const countKey = this.countKey(subject);
    const raw = await this.redis.get(countKey);
    const now = Date.now();
    let count = 1;
    let resetAt = now + 3600_000;
    if (raw) {
      const parsed = JSON.parse(raw) as { count: number; resetAt: number };
      if (parsed.resetAt > now) {
        count = parsed.count + 1;
        resetAt = parsed.resetAt;
      }
    }
    if (count > MAX_SENDS_PER_HOUR) {
      throw new HttpException(
        'Too many codes requested. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.redis.set(
      countKey,
      JSON.stringify({ count, resetAt }),
      Math.max(1, Math.ceil((resetAt - now) / 1000)),
    );
  }

  /** Find by email or JIT-create (OTP over email proves email control). */
  private async resolveOrCreateUser(
    email: string,
  ): Promise<{ user: User; isNewUser: boolean }> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (!existing.emailVerified) {
        const updated = await this.prisma.user.update({
          where: { id: existing.id },
          data: { emailVerified: true },
        });
        return { user: updated, isNewUser: false };
      }
      return { user: existing, isNewUser: false };
    }
    const created = await this.identityService.createIdentity(email);
    const verified = await this.prisma.user.update({
      where: { id: created.id },
      data: { emailVerified: true },
    });
    return { user: verified, isNewUser: true };
  }

  private hash(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  private codeKey(subject: string): string {
    return `otp:code:${subject}`;
  }
  private cooldownKey(subject: string): string {
    return `otp:cooldown:${subject}`;
  }
  private countKey(subject: string): string {
    return `otp:count:${subject}`;
  }
}
