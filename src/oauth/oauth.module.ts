import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthService } from './oauth.service';
import { OAuthController } from './oauth.controller';
import { PkceService } from './pkce.service';
import {
  OAuthClient,
  AuthorizationCode,
  RefreshToken,
  User,
} from '../database/entities';
import { IdentityModule } from '../identity/identity.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient,
      AuthorizationCode,
      RefreshToken,
      User,
    ]),
    IdentityModule,
    forwardRef(() => AuthModule), // Use forwardRef to avoid circular dependency
  ],
  providers: [OAuthService, PkceService],
  controllers: [OAuthController],
  exports: [OAuthService],
})
export class OAuthModule {}



