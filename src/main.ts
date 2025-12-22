import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS configuration for multiple origins
  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Redis client for sessions
  const redisHost = configService.get<string>('REDIS_HOST', 'localhost');
  const redisPort = configService.get<number>('REDIS_PORT', 6379);
  const redisPassword = configService.get<string>('REDIS_PASSWORD');

  const redisClient = createClient({
    url: redisPassword
      ? `redis://:${redisPassword}@${redisHost}:${redisPort}`
      : `redis://${redisHost}:${redisPort}`,
  });
  
  redisClient.on('error', (err) => console.error('Redis Session Error:', err));
  await redisClient.connect();
  console.log('✅ Redis session store connected');

  // Session configuration
  const sessionSecret = configService.get<string>('SESSION_SECRET') || 
                        configService.get<string>('JWT_SECRET') || 
                        'change-this-secret';
  
  app.use(
    session({
      store: new RedisStore({ client: redisClient }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      name: 'inite.sid', // Custom cookie name
      cookie: {
        secure: configService.get<string>('NODE_ENV') === 'production', // HTTPS only in production
        httpOnly: true, // Prevents JavaScript access
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: 'lax', // Allows redirect flows
        domain: configService.get<string>('COOKIE_DOMAIN') || undefined, // e.g., '.inite.ai' for SSO
      },
    }),
  );

  const port = configService.get<number>('PORT', 3002);
  await app.listen(port);

  console.log(`🚀 INITE Identity Provider running on port ${port}`);
  console.log(`🔐 Issuer: ${configService.get<string>('OIDC_ISSUER')}`);
  console.log(`🌍 CORS Origins: ${corsOrigins.join(', ')}`);
  console.log(`🍪 Session cookie domain: ${configService.get<string>('COOKIE_DOMAIN') || 'default'}`);
}

bootstrap();


