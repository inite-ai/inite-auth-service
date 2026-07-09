import { Test, TestingModule } from '@nestjs/testing';
import { LoginSecurityService } from '../login-security.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { MetricsService } from '../../common/metrics.service';
import { RedisService } from '../../common/redis.service';
import { OAuthAuditService } from '../../audit/oauth-audit.service';

const mockMetrics = () => ({
  authAttempts: { inc: jest.fn() },
  accountLockouts: { inc: jest.fn() },
});

describe('LoginSecurityService', () => {
  let service: LoginSecurityService;
  let prisma: { user: { update: jest.Mock; findUnique: jest.Mock } };
  let metrics: ReturnType<typeof mockMetrics>;
  let redis: { setIfAbsent: jest.Mock };

  beforeEach(async () => {
    prisma = { user: { update: jest.fn(), findUnique: jest.fn() } };
    metrics = mockMetrics();
    // setIfAbsent=false => notifications suppressed (debounced) by default
    redis = { setIfAbsent: jest.fn().mockResolvedValue(false) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginSecurityService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: { sendAccountLocked: jest.fn(), sendFailedLoginThreshold: jest.fn() } },
        { provide: MetricsService, useValue: metrics },
        { provide: RedisService, useValue: redis },
        { provide: OAuthAuditService, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<LoginSecurityService>(LoginSecurityService);
  });

  describe('recordFailedLogin (exponential-backoff lockout)', () => {
    it('increments the counter without locking under threshold', async () => {
      await service.recordFailedLogin('user-1', 2);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { failedLoginCount: 3, lockoutUntil: null },
      });
      expect(metrics.accountLockouts.inc).not.toHaveBeenCalled();
    });

    it('triggers a 1-minute lockout on the 5th failed attempt', async () => {
      const before = Date.now();
      await service.recordFailedLogin('user-1', 4);
      const after = Date.now();

      const call = prisma.user.update.mock.calls[0][0];
      expect(call.data.failedLoginCount).toBe(5);
      const lockMs = call.data.lockoutUntil.getTime();
      expect(lockMs).toBeGreaterThanOrEqual(before + 60_000 - 50);
      expect(lockMs).toBeLessThanOrEqual(after + 60_000 + 50);
      expect(metrics.accountLockouts.inc).toHaveBeenCalled();
    });

    it('escalates the lockout window with each subsequent failure', async () => {
      const before = Date.now();
      // 8 prior failures => next is the 9th => 24h
      await service.recordFailedLogin('user-1', 8);

      const call = prisma.user.update.mock.calls[0][0];
      expect(call.data.failedLoginCount).toBe(9);
      expect(call.data.lockoutUntil.getTime()).toBeGreaterThanOrEqual(
        before + 24 * 60 * 60 * 1000 - 100,
      );
    });

    it('debounces the account-locked email via redis setIfAbsent', async () => {
      await service.recordFailedLogin('user-1', 4); // crosses into lockout
      // setIfAbsent resolved false => suppressed => no user lookup for email
      expect(redis.setIfAbsent).toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('recordAttempt', () => {
    it('increments the per-result attempt counter', () => {
      service.recordAttempt('success');
      expect(metrics.authAttempts.inc).toHaveBeenCalledWith({ result: 'success' });
    });
  });
});
