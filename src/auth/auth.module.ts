import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PasskeyService } from './passkey.service';
import { MagicLinkService } from './magic-link.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { User, Passkey, MagicLink, UserKnownDevice } from '../database/entities';
import { IdentityModule } from '../identity/identity.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Passkey, MagicLink, UserKnownDevice]),
    PassportModule,
    IdentityModule,
    EmailModule,
  ],
  providers: [AuthService, PasskeyService, MagicLinkService, JwtStrategy, JwtAuthGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}





