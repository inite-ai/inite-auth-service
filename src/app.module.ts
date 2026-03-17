import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USER', 'postgres'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME', 'inite_auth'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: configService.get<string>('NODE_ENV') !== 'production',
        logging: configService.get<string>('NODE_ENV') !== 'production',
        retryAttempts: 5,
        retryDelay: 3000,
      }),
    }),

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

