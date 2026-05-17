import { Module, forwardRef } from '@nestjs/common';
import { OAuthService } from './oauth.service';
import { OAuthController } from './oauth.controller';
import { PkceService } from './pkce.service';
import { TokenEndpointThrottlerGuard } from './token-throttler.guard';
import { IdentityModule } from '../identity/identity.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    IdentityModule,
    forwardRef(() => AuthModule),
  ],
  providers: [OAuthService, PkceService, TokenEndpointThrottlerGuard],
  controllers: [OAuthController],
  exports: [OAuthService],
})
export class OAuthModule {}
