// jose is ESM and ts-jest can't parse its dist entry. The HealthController
// pulls in JwksService whose source imports `jose`, so we stub jose
// before the import chain executes.
jest.mock('jose', () => ({
  importSPKI: jest.fn(),
  exportJWK: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HealthController } from '../health.controller';
import { JwksService } from '../jwks.service';
import { DbHealthService } from '../db-health.service';
import { RedisService } from '../redis.service';
import { MetricsService } from '../metrics.service';

describe('HealthController', () => {
  let controller: HealthController;
  let dbHealth: { ping: jest.Mock };
  let redis: { ping: jest.Mock };

  beforeEach(async () => {
    dbHealth = { ping: jest.fn() };
    redis = { ping: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('https://auth.example.com') } },
        { provide: JwksService, useValue: { getJwks: jest.fn().mockReturnValue({ keys: [] }) } },
        { provide: DbHealthService, useValue: dbHealth },
        { provide: RedisService, useValue: redis },
        { provide: MetricsService, useValue: { expose: jest.fn() } },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('GET /health (liveness)', () => {
    it('always returns ok without touching dependencies', async () => {
      const result = controller.health();
      expect(result.status).toBe('ok');
      expect(dbHealth.ping).not.toHaveBeenCalled();
      expect(redis.ping).not.toHaveBeenCalled();
    });
  });

  describe('GET /ready (readiness)', () => {
    it('returns ok when both DB and Redis respond', async () => {
      dbHealth.ping.mockResolvedValue(undefined);
      redis.ping.mockResolvedValue('PONG');

      const result = await controller.ready();
      expect(result.status).toBe('ok');
      expect(result.checks.db?.ok).toBe(true);
      expect(result.checks.redis?.ok).toBe(true);
    });

    it('returns 503 when DB query fails', async () => {
      dbHealth.ping.mockRejectedValue(new Error('connection refused'));
      redis.ping.mockResolvedValue('PONG');

      try {
        await controller.ready();
        fail('should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(HttpException);
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        const body = httpErr.getResponse() as {
          status?: string;
          checks?: Record<string, { ok: boolean; error?: string }>;
        };
        expect(body.status).toBe('degraded');
        expect(body.checks?.db?.ok).toBe(false);
        expect(body.checks?.db?.error).toContain('connection refused');
      }
    });

    it('returns 503 when Redis returns wrong response', async () => {
      dbHealth.ping.mockResolvedValue(undefined);
      redis.ping.mockResolvedValue('NOT-PONG');

      try {
        await controller.ready();
        fail('should have thrown');
      } catch (err: unknown) {
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        const body = httpErr.getResponse() as {
          checks?: Record<string, { ok: boolean }>;
        };
        expect(body.checks?.redis?.ok).toBe(false);
      }
    });
  });
});
