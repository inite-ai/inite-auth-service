import { Module, Global } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { JwksService } from './jwks.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [LoggerService, JwksService, RedisService],
  exports: [LoggerService, JwksService, RedisService],
})
export class CommonModule {}



