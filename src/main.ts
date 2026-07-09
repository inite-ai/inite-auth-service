// Load .env into process.env before anything else. Prisma 7's driver adapter
// reads DATABASE_URL in the PrismaService constructor (earlier than Prisma 6's
// lazy $connect), so the env must be populated up front. No-op in production
// where the container provides the vars; dotenv never overrides existing ones.
import 'dotenv/config';

// MUST be first (after env) — OTel auto-instrumentations need to load before
// http/express/pg/redis get pulled in by everything below.
import { startTracing } from './tracing';
startTracing();

import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';
import { AppModule } from './app.module';
import { OAuthOriginsService } from './oauth/oauth-origins.service';
import { createLogger } from './common/logger.service';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

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

  // OpenAPI / Swagger.
  //
  // Documents the HTTP surface for integrators. Interactive UI at /docs, the
  // raw spec at /openapi.json. We also emit the spec to disk on boot (outside
  // production, where the container FS may be read-only) so it can be committed
  // and consumed by client codegen / contract tests. @ApiTags/@ApiOperation are
  // added to controllers incrementally; untagged routes land under "default".
  const swaggerConfig = new DocumentBuilder()
    .setTitle('INITE Identity Provider')
    .setDescription(
      'OAuth 2.1 / OIDC authorization server + identity APIs. ' +
        'Most routes are versioned under /v1; spec/discovery endpoints ' +
        '(.well-known/*) are version-neutral per their RFCs.',
    )
    .setVersion(process.env.npm_package_version ?? '1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('auth', 'Password, passkey, magic-link, MFA and session login flows')
    .addTag('oauth', 'OAuth 2.1 / OIDC authorization, token and client endpoints')
    .addTag('identity', 'DID and Verifiable Credential issuance')
    .addTag('admin', 'Administrative client/user management (privileged)')
    .addTag('health', 'Liveness, readiness, metrics and JWKS')
    .build();
  const openapiDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, openapiDocument, {
    jsonDocumentUrl: 'openapi.json',
    swaggerOptions: { persistAuthorization: true },
  });
  if (configService.get<string>('NODE_ENV') !== 'production') {
    try {
      writeFileSync('openapi.json', JSON.stringify(openapiDocument, null, 2));
    } catch (err) {
      logger.warn(`Could not write openapi.json: ${(err as Error).message}`);
    }
  }

  // Security headers
  //
  // CSP is built from the synchronous origins cache so embed-registered
  // partner origins can XHR to this API and load us in iframes. Without
  // this, connectSrc='self' would block any cross-origin SDK call even
  // when CORS itself allows it.
  //
  // We don't allow * — the allowlist is the OAuth-client redirectUris
  // table, mirrored from the same source CORS uses. Iframe ancestors
  // are similarly scoped via frame-ancestors so we keep clickjacking
  // resistance for non-partners.
  const oauthForCsp = app.get(OAuthOriginsService);
  // Warm the cache up front so the first request doesn't get an
  // empty allowlist for one cycle.
  await oauthForCsp.getAllowedOrigins();
  app.use((_req: Request, res: Response, next: NextFunction) => {
    const partners = [...oauthForCsp.getAllowedOriginsSync()];
    res.locals.allowedPartners = partners;
    next();
  });

  // helmet's CSP directive callbacks receive Node's raw (IncomingMessage,
  // ServerResponse), not the Express Response — but at runtime the object is
  // the same Express response carrying `.locals`. This typed shape reads the
  // partner list set by the middleware above without an `any`.
  interface CspLocals {
    allowedPartners?: string[];
  }
  const cspAllowedPartners = (res: ServerResponse): string =>
    (res as ServerResponse & { locals?: CspLocals }).locals?.allowedPartners?.join(
      ' ',
    ) ?? '';
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          // Build per-request: refresh the partner list every time.
          // helmet calls the function with (req, res); the cache call
          // is O(1) so this stays cheap.
          connectSrc: [
            "'self'",
            (_req: IncomingMessage, res: ServerResponse) =>
              cspAllowedPartners(res),
          ],
          frameAncestors: [
            "'self'",
            (_req: IncomingMessage, res: ServerResponse) =>
              cspAllowedPartners(res),
          ],
        },
      },
      // Override the default X-Frame-Options=SAMEORIGIN — that header
      // is older than CSP frame-ancestors and is now used by browsers
      // as a hard fallback that overrides CSP. Disabling lets the
      // (correctly-scoped) frame-ancestors directive be authoritative.
      frameguard: false,
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    }),
  );

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Catch-all exception filter — adds structured logging for 5xx / unhandled
  // errors without altering any response body (OAuth RFC error shapes intact).
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));

  // Dynamic CORS — check origin against OAuth client redirect URIs on every request
  // Reuse OAuthOriginsService for allowed origins (cached, auto-refreshes every 60s)
  const oauthService = app.get(OAuthOriginsService);
  const allowedOrigins = await oauthService.getAllowedOrigins();
  logger.log(`CORS Origins: ${[...allowedOrigins].join(', ')}`);

  app.enableCors({
    origin: async (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
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

  const hasRedisPassword = !!(redisPassword && redisPassword.trim().length > 0);
  const redisClient = createClient({
    socket: { host: redisHost, port: redisPort },
    ...(hasRedisPassword ? { password: redisPassword } : {}),
  });
  redisClient.on('error', (err) => logger.error('Redis error', err.message));
  await redisClient.connect();
  logger.log('Redis session store connected');

  // Cookie parser
  app.use(cookieParser());

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Monkeypatch res.end to log on flush. res.end is overloaded, so we bind
    // the original and cast the replacement back to its exact type — no `any`.
    type EndFn = Response['end'];
    const originalEnd = res.end.bind(res) as (...args: unknown[]) => Response;
    res.end = function (this: Response, ...args: unknown[]): Response {
      const setCookie = res.getHeader('Set-Cookie');
      // Only log auth/oauth requests
      if (req.path.includes('/auth/') || req.path.includes('/oauth/')) {
        logger.request({
          method: req.method,
          path: req.path,
          status: res.statusCode,
          data: { hasCookie: !!setCookie },
        });
      }
      return originalEnd(...args);
    } as EndFn;
    next();
  });

  // Session configuration
  const configuredSecret = configService.get<string>('SESSION_SECRET') ||
                           configService.get<string>('JWT_SECRET');
  if (!configuredSecret) {
    throw new Error('SESSION_SECRET or JWT_SECRET must be set in environment');
  }
  sessionSecret = configuredSecret;

  // Dual session config: first-party flow gets `inite.sid` with
  // SameSite=lax (CSRF protection for browser-driven OAuth), embed
  // flow gets `inite.sid.embed` with SameSite=none so the cookie
  // survives a cross-origin iframe POST.
  //
  // Choice is keyed on Origin: a partner whose origin is in the
  // OAuth-client allowlist (and not equal to FRONTEND_URL) gets the
  // embed cookie. Everything else (no Origin, FRONTEND_URL Origin,
  // unknown Origin) gets the first-party cookie.
  //
  // CSRF on the embed surface is contained by the CORS Origin check —
  // an unallowed origin can't reach the endpoint in the first place.
  const sessionBase = {
    store: new RedisStore({ client: redisClient }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
  } as const;
  const firstPartySession = session({
    ...sessionBase,
    name: 'inite.sid',
    cookie: {
      secure: true,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      path: '/',
    },
  });
  const embedSession = session({
    ...sessionBase,
    name: 'inite.sid.embed',
    cookie: {
      secure: true,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'none',
      path: '/',
    },
  });
  const normalizedFrontendUrl = (
    configService.get<string>('FRONTEND_URL', '') ?? ''
  ).replace(/\/$/, '');
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      const allowed = oauthForCsp.getAllowedOriginsSync();
      if (allowed.has(origin) && origin !== normalizedFrontendUrl) {
        return embedSession(req, res, next);
      }
    }
    return firstPartySession(req, res, next);
  });

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

// A rejected promise anywhere in the process must not vanish: log it. These are
// last-resort nets — real handlers still belong at the call site.
process.on('unhandledRejection', (reason) => {
  logger.error(
    'Unhandled promise rejection',
    reason instanceof Error ? reason.stack ?? reason.message : String(reason),
  );
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err.stack ?? err.message);
  // An uncaught exception leaves the process in an undefined state — exit so
  // the orchestrator restarts a clean instance rather than serving corrupt.
  process.exit(1);
});

// If bootstrap rejects (Prisma/Redis/config), fail loudly and exit non-zero so
// the deploy's health check catches it instead of a silent, dead process.
bootstrap().catch((err) => {
  logger.error(
    'Fatal: application bootstrap failed',
    err instanceof Error ? err.stack ?? err.message : String(err),
  );
  process.exit(1);
});
