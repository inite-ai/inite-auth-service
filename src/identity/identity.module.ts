import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { IdentityMfaService } from './identity-mfa.service';
import { IdentityAccountService } from './identity-account.service';
import { IdentityEmailService } from './identity-email.service';
import { DidService } from './did.service';
import { IdentityController } from './identity.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  providers: [
    IdentityService,
    IdentityMfaService,
    IdentityAccountService,
    IdentityEmailService,
    DidService,
  ],
  controllers: [IdentityController],
  exports: [IdentityService, DidService],
})
export class IdentityModule {}
