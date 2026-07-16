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
import { DcrReaperService } from './dcr-reaper.service';
import { ClientJwksService } from './client-jwks.service';
import { ClientAssertionService } from './client-assertion.service';
import { ClientAssertionJtiStore } from './client-assertion-jti.store';
import { ClientAssertionJtiReaperService } from './client-assertion-jti-reaper.service';
import { ClientAuthService } from './client-auth.service';
import { RequestObjectService } from './request-object.service';
import { AuthorizationDetailsService } from './authorization-details.service';
import { ApiKeysService } from './api-keys.service';
import { MtlsService } from './mtls.service';
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
    DcrReaperService,
    ClientJwksService,
    ClientAssertionService,
    ClientAssertionJtiStore,
    ClientAssertionJtiReaperService,
    ClientAuthService,
    RequestObjectService,
    AuthorizationDetailsService,
    ApiKeysService,
    MtlsService,
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
    AuthorizationDetailsService,
    ApiKeysService,
  ],
})
export class OAuthModule {}
