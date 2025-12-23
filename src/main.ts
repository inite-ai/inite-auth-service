import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';
import { AppModule } from './app.module';
import { createLogger } from './common/logger.service';

// Export for use in controllers
export let sessionSecret: string;

const logger = createLogger('Bootstrap');

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

  // CORS configuration
  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Set-Cookie'],
  });

  // Redis client for sessions
  const redisHost = configService.get<string>('REDIS_HOST', 'localhost');
  const redisPort = configService.get<number>('REDIS_PORT', 6379);
  const redisPassword = configService.get<string>('REDIS_PASSWORD');

  const redisConfig: any = {
    socket: { host: redisHost, port: redisPort },
  };
  
  if (redisPassword && redisPassword.trim().length > 0) {
    redisConfig.password = redisPassword;
  }

  const redisClient = createClient(redisConfig);
  redisClient.on('error', (err) => logger.error('Redis error', err.message));
  await redisClient.connect();
  logger.log('Redis session store connected');

  // Cookie parser
  app.use(cookieParser());

  // Request logging middleware
  app.use((req: any, res: any, next: any) => {
    const originalEnd = res.end;
    res.end = function(...args: any[]) {
      const setCookie = res.getHeader('Set-Cookie');
      // Only log auth/oauth requests
      if (req.path.includes('/auth/') || req.path.includes('/oauth/')) {
        logger.request(req.method, req.path, res.statusCode, {
          hasCookie: !!setCookie,
        });
      }
      return originalEnd.apply(this, args);
    };
    next();
  });

  // Session configuration
  sessionSecret = configService.get<string>('SESSION_SECRET') || 
                  configService.get<string>('JWT_SECRET') || 
                  'change-this-secret';
  
  app.use(
    session({
      store: new RedisStore({ client: redisClient }),
      secret: sessionSecret,
      resave: true,
      saveUninitialized: true,
      name: 'inite.sid',
      cookie: {
        secure: true,
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: 'lax',
        path: '/',
      },
    }),
  );

  const port = configService.get<number>('PORT', 3002);
  await app.listen(port);

  logger.log(`INITE Identity Provider running on port ${port}`);
  logger.log(`Issuer: ${configService.get<string>('OIDC_ISSUER')}`);
  logger.log(`CORS Origins: ${corsOrigins.join(', ')}`);
}

bootstrap();
