import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { DidService } from './did.service';
import { IdentityController } from './identity.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  providers: [IdentityService, DidService],
  controllers: [IdentityController],
  exports: [IdentityService, DidService],
})
export class IdentityModule {}
