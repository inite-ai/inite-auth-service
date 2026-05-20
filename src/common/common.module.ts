import { Module, Global } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { JwksService } from './jwks.service';
import { RedisService } from './redis.service';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  providers: [LoggerService, JwksService, RedisService, MetricsService],
  exports: [LoggerService, JwksService, RedisService, MetricsService],
})
export class CommonModule {}



