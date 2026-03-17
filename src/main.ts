import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';
import { AppModule } from './app.module';
import { OAuthClient } from './database/entities';
import { createLogger } from './common/logger.service';

// Export for use in controllers
export let sessionSecret: string;

const logger = createLogger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  }));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS configuration — build origins from OAuth client redirect URIs
  const frontendUrl = configService.get<string>('FRONTEND_URL', '');
  const extraOrigins = configService
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .filter(Boolean);

  // Collect origins from all registered OAuth clients
  const clientOrigins = new Set<string>(extraOrigins);
  if (frontendUrl) clientOrigins.add(frontendUrl);

  try {
    const clientRepo = app.get<Repository<OAuthClient>>(getRepositoryToken(OAuthClient));
    const clients = await clientRepo.find({
      where: { active: true },
      select: ['redirectUris'],
    });
    for (const client of clients) {
      const uris = Array.isArray(client.redirectUris) ? client.redirectUris : [];
      for (const uri of uris) {
        try {
          clientOrigins.add(new URL(uri).origin);
        } catch { /* skip invalid URIs */ }
      }
    }
  } catch (err: any) {
    logger.warn(`Could not load OAuth clients for CORS: ${err.message}`);
  }

  const corsOrigins = [...clientOrigins];

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
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
  const configuredSecret = configService.get<string>('SESSION_SECRET') ||
                           configService.get<string>('JWT_SECRET');
  if (!configuredSecret) {
    throw new Error('SESSION_SECRET or JWT_SECRET must be set in environment');
  }
  sessionSecret = configuredSecret;

  app.use(
    session({
      store: new RedisStore({ client: redisClient }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
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
