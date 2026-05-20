import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PasskeyService } from './passkey.service';
import { MagicLinkService } from './magic-link.service';
import { HibpService } from './hibp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { IdentityModule } from '../identity/identity.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    PassportModule,
    IdentityModule,
    EmailModule,
  ],
  providers: [
    AuthService,
    PasskeyService,
    MagicLinkService,
    HibpService,
    JwtStrategy,
    JwtAuthGuard,
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
