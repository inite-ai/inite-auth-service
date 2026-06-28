import { Module, forwardRef } from '@nestjs/common';
import { OAuthService } from './oauth.service';
import { OAuthController } from './oauth.controller';
import { TokenController } from './token.controller';
import { TokenGrantService } from './token-grant.service';
import { PkceService } from './pkce.service';
import { StepUpService } from './step-up.service';
import { TokenEndpointThrottlerGuard } from './token-throttler.guard';
import { BackchannelLogoutService } from './backchannel-logout.service';
import { DpopService } from './dpop.service';
import { ParService } from './par.service';
import { DeviceFlowService } from './device-flow.service';
import { SystemClientsSeeder } from './system-clients.seeder';
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
    TokenGrantService,
    PkceService,
    StepUpService,
    TokenEndpointThrottlerGuard,
    ClientIdThrottlerGuard,
    BackchannelLogoutService,
    DpopService,
    ParService,
    DeviceFlowService,
    SystemClientsSeeder,
  ],
  controllers: [OAuthController, TokenController],
  exports: [
    OAuthService,
    StepUpService,
    BackchannelLogoutService,
    DpopService,
    ParService,
    DeviceFlowService,
  ],
})
export class OAuthModule {}
