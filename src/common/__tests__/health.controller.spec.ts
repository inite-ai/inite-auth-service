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
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };
    redis = { ping: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('https://auth.inite.ai') } },
        { provide: JwksService, useValue: { getJwks: jest.fn().mockReturnValue({ keys: [] }) } },
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('GET /health (liveness)', () => {
    it('always returns ok without touching dependencies', async () => {
      const result = controller.health();
      expect(result.status).toBe('ok');
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(redis.ping).not.toHaveBeenCalled();
    });
  });

  describe('GET /ready (readiness)', () => {
    it('returns ok when both DB and Redis respond', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue('PONG');

      const result = await controller.ready();
      expect(result.status).toBe('ok');
      expect(result.checks.db.ok).toBe(true);
      expect(result.checks.redis.ok).toBe(true);
    });

    it('returns 503 when DB query fails', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
      redis.ping.mockResolvedValue('PONG');

      try {
        await controller.ready();
        fail('should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        const body = err.getResponse();
        expect(body.status).toBe('degraded');
        expect(body.checks.db.ok).toBe(false);
        expect(body.checks.db.error).toContain('connection refused');
      }
    });

    it('returns 503 when Redis returns wrong response', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue('NOT-PONG');

      try {
        await controller.ready();
        fail('should have thrown');
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        const body = err.getResponse();
        expect(body.checks.redis.ok).toBe(false);
      }
    });
  });
});
