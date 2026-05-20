// MUST be first — OTel auto-instrumentations need to load before
// http/express/pg/redis get pulled in by everything below.
import { startTracing } from './tracing';
startTracing();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';
import { AppModule } from './app.module';
import { OAuthService } from './oauth/oauth.service';
import { createLogger } from './common/logger.service';

// Export for use in controllers
export let sessionSecret: string;

const logger = createLogger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  // URI-based API versioning. Controllers are marked individually:
  //   `@Controller({ path: 'oauth', version: '1' })`     → /v1/oauth/*
  //   `@Controller({ path: '...', version: VERSION_NEUTRAL })` → unprefixed
  //
  // Spec endpoints (.well-known/*) stay neutral because RFC/OIDC
  // discovery URLs are fixed by spec, not by us. Everything else
  // hides behind /v1 so a v2 cutover later can ship side-by-side.
  app.enableVersioning({ type: VersioningType.URI });

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

  // Dynamic CORS — check origin against OAuth client redirect URIs on every request
  const frontendUrl = configService.get<string>('FRONTEND_URL', '');
  // Reuse OAuthService for allowed origins (cached, auto-refreshes every 60s)
  const oauthService = app.get(OAuthService);
  const allowedOrigins = await oauthService.getAllowedOrigins();
  logger.log(`CORS Origins: ${[...allowedOrigins].join(', ')}`);

  app.enableCors({
    origin: async (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin) return callback(null, true);
      const allowed = await oauthService.getAllowedOrigins();
      if (allowed.has(origin)) return callback(null, true);
      callback(new Error(`CORS: ${origin} not allowed`));
    },
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

  // The session-store Redis client is created here, not through DI, so
  // enableShutdownHooks() doesn't close it. Wire it to SIGTERM/SIGINT
  // manually so containers don't drop sessions on rolling deploys.
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.once(sig, () => {
      logger.log(`Received ${sig}, closing session redis client`);
      redisClient.quit().catch((err) =>
        logger.error('Redis quit error', err?.message ?? 'unknown'),
      );
    });
  }

  const port = configService.get<number>('PORT', 3002);
  await app.listen(port);

  logger.log(`INITE Identity Provider running on port ${port}`);
  logger.log(`Issuer: ${configService.get<string>('OIDC_ISSUER')}`);
}

bootstrap();
