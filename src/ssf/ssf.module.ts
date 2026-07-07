import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SsfController } from './ssf.controller';
import { SetBuilderService } from './set-builder.service';
import { SetPushService } from './set-push.service';
import { SsfEmitterService } from './ssf-emitter.service';
import { SsfStreamService } from './ssf-stream.service';
import { SsfDeliveryService } from './ssf-delivery.service';

/**
 * SSF/CAEP transmitter. @Global so auth flows can inject SsfEmitterService
 * (@Optional, fire-and-forget) to signal session/token/credential events
 * without importing this module.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [SsfController],
  providers: [SetBuilderService, SetPushService, SsfEmitterService, SsfStreamService, SsfDeliveryService],
  exports: [SsfEmitterService],
})
export class SsfModule {}
