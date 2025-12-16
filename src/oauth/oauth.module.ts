import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient,
      AuthorizationCode,
      RefreshToken,
      User,
    ]),
    IdentityModule,
  ],
  providers: [OAuthService, PkceService],
  controllers: [OAuthController],
  exports: [OAuthService],
})
export class OAuthModule {}

