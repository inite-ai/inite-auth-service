import { Module, forwardRef } from '@nestjs/common';
import { OAuthService } from './oauth.service';
import { OAuthController } from './oauth.controller';
import { PkceService } from './pkce.service';
import { TokenEndpointThrottlerGuard } from './token-throttler.guard';
import { BackchannelLogoutService } from './backchannel-logout.service';
import { DpopService } from './dpop.service';
import { ParService } from './par.service';
import { DeviceFlowService } from './device-flow.service';
import { IdentityModule } from '../identity/identity.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { ClientIdThrottlerGuard } from './client-throttler.guard';

@Module({
  imports: [
    IdentityModule,
    EmailModule,
    forwardRef(() => AuthModule),
  ],
  providers: [
    OAuthService,
    PkceService,
    TokenEndpointThrottlerGuard,
    ClientIdThrottlerGuard,
    BackchannelLogoutService,
    DpopService,
    ParService,
    DeviceFlowService,
  ],
  controllers: [OAuthController],
  exports: [
    OAuthService,
    BackchannelLogoutService,
    DpopService,
    ParService,
    DeviceFlowService,
  ],
})
export class OAuthModule {}
