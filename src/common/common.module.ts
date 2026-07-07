import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from './logger.service';
import { JwksService } from './jwks.service';
import { RedisService } from './redis.service';
import { MetricsService } from './metrics.service';
import { DbHealthService } from './db-health.service';
import { FieldCrypto } from './field-crypto';

const fieldCryptoProvider = {
  provide: FieldCrypto,
  useFactory: (config: ConfigService): FieldCrypto =>
    FieldCrypto.fromEnv(config.get<string>('FIELD_ENCRYPTION_KEY')),
  inject: [ConfigService],
};

@Global()
@Module({
  providers: [LoggerService, JwksService, RedisService, MetricsService, DbHealthService, fieldCryptoProvider],
  exports: [LoggerService, JwksService, RedisService, MetricsService, DbHealthService, FieldCrypto],
})
export class CommonModule {}



