import { Module, Global } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { JwksService } from './jwks.service';

@Global()
@Module({
  providers: [LoggerService, JwksService],
  exports: [LoggerService, JwksService],
})
export class CommonModule {}



