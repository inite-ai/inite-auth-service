import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { FederationModule } from './auth/federation/federation.module';
import { OtpModule } from './auth/otp/otp.module';
import { WalletModule } from './auth/wallet/wallet.module';
import { IdentityModule } from './identity/identity.module';
import { OAuthModule } from './oauth/oauth.module';
import { SessionModule } from './session/session.module';
import { EmailModule } from './email/email.module';
import { AdminModule } from './admin/admin.module';
import { SsfModule } from './ssf/ssf.module';
import { AuditModule } from './audit/audit.module';
import { CommonModule } from './common/common.module';
import { HealthController } from './common/health.controller';
import { RequestContextMiddleware } from './common/request-context.middleware';

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

    // JWT: RS256 (JWKS) when JWT_PRIVATE_KEY set, else HS256 (JWT_SECRET).
    //
    // HS256 is dev-only. In production we hard-fail at boot if a private
    // key is missing — letting it silently fall through to HS256 means
    // anyone with the symmetric secret can mint tokens, and that secret
    // ends up in env-files and CI logs.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const privateKey = configService.get<string>('JWT_PRIVATE_KEY');
        const issuer = configService.get<string>('JWT_ISSUER', 'http://localhost:3002');
        const nodeEnv = configService.get<string>('NODE_ENV', 'development');

        if (nodeEnv === 'production' && !privateKey) {
          throw new Error(
            'JWT_PRIVATE_KEY must be set in production. HS256 fallback is dev-only.',
          );
        }

        if (privateKey) {
          return {
            secretOrPrivateKey: privateKey,
            signOptions: {
              algorithm: 'RS256',
              issuer,
              keyid: 'auth-rs256-key-1',
            },
            verifyOptions: {
              algorithms: ['RS256'],
              issuer,
            },
          };
        }
        return {
          secret: configService.get<string>('JWT_SECRET'),
          signOptions: { algorithm: 'HS256', issuer },
          verifyOptions: { algorithms: ['HS256'], issuer },
        };
      },
    }),

    // Common Module (global)
    CommonModule,

    // Audit (global) — durable OAuth + client lifecycle audit trail
    AuditModule,

    // Feature Modules
    AuthModule,
    FederationModule,
    OtpModule,
    WalletModule,
    IdentityModule,
    OAuthModule,
    SessionModule,
    EmailModule,
    AdminModule,
    SsfModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Correlation ID + AsyncLocalStorage context must wrap ALL
    // requests so every log line and audit row picks up the
    // current request's ID.
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
