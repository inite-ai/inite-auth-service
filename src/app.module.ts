import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { IdentityModule } from './identity/identity.module';
import { OAuthModule } from './oauth/oauth.module';
import { SessionModule } from './session/session.module';
import { EmailModule } from './email/email.module';
import { AdminModule } from './admin/admin.module';
import { CommonModule } from './common/common.module';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting (global default: 60 req/min)
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60,
    }]),

    // Scheduled tasks
    ScheduleModule.forRoot(),

    // Database (Prisma - global module)
    PrismaModule,

    // JWT: RS256 (JWKS) when JWT_PRIVATE_KEY set, else HS256 (JWT_SECRET)
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const privateKey = configService.get<string>('JWT_PRIVATE_KEY');
        const issuer = configService.get<string>('JWT_ISSUER', 'auth.inite.ai');
        if (privateKey) {
          return {
            secretOrPrivateKey: privateKey,
            signOptions: {
              algorithm: 'RS256',
              issuer,
              keyid: 'auth-rs256-key-1',
            },
          };
        }
        return {
          secret: configService.get<string>('JWT_SECRET'),
          signOptions: { issuer },
        };
      },
    }),

    // Common Module (global)
    CommonModule,

    // Feature Modules
    AuthModule,
    IdentityModule,
    OAuthModule,
    SessionModule,
    EmailModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
