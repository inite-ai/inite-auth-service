import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { MetricsService } from '../common/metrics.service';
import { RedisService } from '../common/redis.service';
import { OAuthAuditService } from '../audit/oauth-audit.service';
import { LoggerService } from '../common/logger.service';
import { swallow } from '../common/fire-and-forget';

type AttemptResult = 'success' | 'invalid' | 'locked';

/**
 * Owns the brute-force defences around password login: attempt metrics,
 * audit records, failed-login counting with exponential-backoff lockout,
 * and the (debounced) user notifications. Extracted from AuthService so
 * that service stays focused on authentication, not security plumbing.
 */
@Injectable()
export class LoginSecurityService {
  private readonly logger = new LoggerService();

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly metrics: MetricsService,
    private readonly redis: RedisService,
    private readonly audit: OAuthAuditService,
  ) {
    this.logger.setContext('LoginSecurityService');
  }

  /** Increment the per-result login-attempt counter. */
  recordAttempt(result: AttemptResult): void {
    this.metrics.authAttempts.inc({ result });
  }

  /** Fire-and-forget audit of a failed password login. */
  auditLoginFailed(sub: string): void {
    this.audit
      .record({
        event: 'auth.login.failed',
        sub,
        success: false,
        errorMessage: 'invalid_credentials',
      })
      .catch(swallow(this.logger, 'audit auth.login.failed'));
  }

  /** Fire-and-forget audit of a successful password login. */
  auditLoginSuccess(sub: string): void {
    this.audit
      .record({
        event: 'auth.login.password',
        sub,
        success: true,
      })
      .catch(swallow(this.logger, 'audit auth.login.password'));
  }

  /**
   * Increment failed-login counter and set lockoutUntil with
   * exponential backoff once threshold is crossed.
   *
   * Schedule: first 5 misses raise the counter but do not lock. The
   * 5th miss (count becomes 5) starts a 1-minute lock. Each further
   * miss multiplies: 5m, 15m, 1h, 24h, then capped at 24h.
   */
  async recordFailedLogin(userId: string, currentCount: number): Promise<void> {
    const next = currentCount + 1;
    const lockoutSchedule = [
      { atFailures: 5, lockMs: 60 * 1000 },           // 1m
      { atFailures: 6, lockMs: 5 * 60 * 1000 },       // 5m
      { atFailures: 7, lockMs: 15 * 60 * 1000 },      // 15m
      { atFailures: 8, lockMs: 60 * 60 * 1000 },      // 1h
      { atFailures: 9, lockMs: 24 * 60 * 60 * 1000 }, // 24h
    ];
    const tier = [...lockoutSchedule]
      .reverse()
      .find((t) => next >= t.atFailures);
    const lockoutUntil = tier ? new Date(Date.now() + tier.lockMs) : null;

    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: next, lockoutUntil },
    });

    if (lockoutUntil) {
      this.metrics.accountLockouts.inc();
      this.logger.auth('Account locked after failed login', {
        userId,
        failedCount: next,
        lockoutUntil: lockoutUntil.toISOString(),
      });
      // Notify the user — debounced so the email isn't re-sent on
      // every additional failure that just extends the lock.
      this.notifyAccountLocked(userId, lockoutUntil).catch(
        swallow(this.logger, 'account-locked notification'),
      );
    }

    // Heads-up at the third consecutive miss, BEFORE the lock kicks
    // in at the fifth. Gives the user a chance to react (reset
    // password, enable 2FA) instead of finding their account already
    // locked. One notification per pre-lockout window per user.
    if (next === 3) {
      this.notifyFailedLoginThreshold(userId, next).catch(
        swallow(this.logger, 'failed-login-threshold notification'),
      );
    }
  }

  /**
   * Fire-and-forget account-locked notification. Debounce window is
   * the lockout duration: if a new lock starts strictly after the
   * previous one expired, we send again; otherwise we suppress.
   */
  private async notifyAccountLocked(userId: string, lockedUntil: Date): Promise<void> {
    try {
      const wasSet = await this.redis.setIfAbsent(
        `notify:locked:${userId}`,
        lockedUntil.toISOString(),
        // TTL matches lockout: once it lifts, the next lock is a
        // fresh event worth notifying about.
        Math.max(60, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000)),
      );
      if (!wasSet) return;

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });
      if (!user?.email) return;

      await this.emailService.sendAccountLocked(
        { email: user.email, name: user.name ?? undefined },
        lockedUntil,
      );
    } catch (e: unknown) {
      this.logger.warn(
        `account-locked notification failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
    }
  }

  /**
   * Pre-lockout warning email. Debounced for an hour so we don't
   * fire on every retry inside a single attack burst.
   */
  private async notifyFailedLoginThreshold(
    userId: string,
    attemptCount: number,
  ): Promise<void> {
    try {
      const wasSet = await this.redis.setIfAbsent(
        `notify:failed-threshold:${userId}`,
        String(attemptCount),
        3600,
      );
      if (!wasSet) return;

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });
      if (!user?.email) return;

      await this.emailService.sendFailedLoginThreshold(
        { email: user.email, name: user.name ?? undefined },
        attemptCount,
      );
    } catch (e: unknown) {
      this.logger.warn(
        `failed-login-threshold notification failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
    }
  }
}
