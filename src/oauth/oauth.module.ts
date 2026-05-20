import { Module, forwardRef } from '@nestjs/common';
import { OAuthService } from './oauth.service';
import { OAuthController } from './oauth.controller';
import { PkceService } from './pkce.service';
import { TokenEndpointThrottlerGuard } from './token-throttler.guard';
import { BackchannelLogoutService } from './backchannel-logout.service';
import { DpopService } from './dpop.service';
import { IdentityModule } from '../identity/identity.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    IdentityModule,
    forwardRef(() => AuthModule),
  ],
  providers: [
    OAuthService,
    PkceService,
    TokenEndpointThrottlerGuard,
    BackchannelLogoutService,
    DpopService,
  ],
  controllers: [OAuthController],
  exports: [OAuthService, BackchannelLogoutService, DpopService],
})
export class OAuthModule {}
