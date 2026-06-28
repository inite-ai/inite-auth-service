import { Module } from '@nestjs/common';
import { AuthModule } from '../auth.module';
import { IdentityModule } from '../../identity/identity.module';
import { EmailModule } from '../../email/email.module';
import { OtpService } from './otp.service';
import { OtpController } from './otp.controller';
import { TwilioSmsProvider } from './sms/twilio.provider';
import { SMS_PROVIDER } from './sms/sms-provider.interface';

/**
 * Email/SMS OTP factor. The SMS transport is bound through the SMS_PROVIDER
 * token so the implementation is swappable; Twilio is the default (inert until
 * its credentials are set). AuthModule is imported for AuthService (token
 * issuance) and the JWT guard used on the step-up endpoints.
 */
@Module({
  imports: [AuthModule, IdentityModule, EmailModule],
  providers: [
    OtpService,
    { provide: SMS_PROVIDER, useClass: TwilioSmsProvider },
  ],
  controllers: [OtpController],
  exports: [OtpService],
})
export class OtpModule {}
