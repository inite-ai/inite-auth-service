import { Module, forwardRef } from '@nestjs/common';
import { OAuthService } from './oauth.service';
import { OAuthClientRegistryService } from './oauth-client-registry.service';
import { OAuthTokenIssuerService } from './oauth-token-issuer.service';
import { OAuthM2mService } from './oauth-m2m.service';
import { OAuthOriginsService } from './oauth-origins.service';
import { OAuthController } from './oauth.controller';
import { OAuthRequestController } from './oauth-request.controller';
import { OAuthSessionController } from './oauth-session.controller';
import { TokenController } from './token.controller';
import { OAuthRegisterController } from './oauth-register.controller';
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
    OAuthClientRegistryService,
    OAuthTokenIssuerService,
    OAuthM2mService,
    OAuthOriginsService,
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
  controllers: [
    OAuthController,
    OAuthRequestController,
    OAuthSessionController,
    TokenController,
    OAuthRegisterController,
  ],
  exports: [
    OAuthService,
    OAuthOriginsService,
    StepUpService,
    BackchannelLogoutService,
    DpopService,
    ParService,
    DeviceFlowService,
  ],
})
export class OAuthModule {}
