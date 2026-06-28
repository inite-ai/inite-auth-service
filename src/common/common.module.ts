import { Module, Global } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { JwksService } from './jwks.service';
import { RedisService } from './redis.service';
import { MetricsService } from './metrics.service';
import { DbHealthService } from './db-health.service';

@Global()
@Module({
  providers: [LoggerService, JwksService, RedisService, MetricsService, DbHealthService],
  exports: [LoggerService, JwksService, RedisService, MetricsService, DbHealthService],
})
export class CommonModule {}



