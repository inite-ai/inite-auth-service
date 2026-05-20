import { Controller, Get, Header, HttpCode, HttpStatus, HttpException, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { JwksService } from './jwks.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from './redis.service';
import { MetricsService } from './metrics.service';

@Controller()
export class HealthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwksService: JwksService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  @Get('metrics')
  async metricsEndpoint(@Res() res: Response): Promise<void> {
    const { contentType, body } = await this.metrics.expose();
    res.setHeader('Content-Type', contentType);
    res.send(body);
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'inite-auth-service',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  @Get('ready')
  async ready() {
    const checks: Record<string, { ok: boolean; error?: string; latencyMs?: number }> = {};

    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = { ok: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      checks.db = { ok: false, error: err?.message ?? 'unknown' };
    }

    const redisStart = Date.now();
    try {
      const pong = await this.redis.ping();
      checks.redis = { ok: pong === 'PONG', latencyMs: Date.now() - redisStart };
    } catch (err: any) {
      checks.redis = { ok: false, error: err?.message ?? 'unknown' };
    }

    const allOk = Object.values(checks).every((c) => c.ok);
    const payload = {
      status: allOk ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };

    if (!allOk) {
      throw new HttpException(payload, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return payload;
  }

  /**
   * Apple App Site Association for Passkeys/WebAuthn
   * Required for Safari to show "This Device" option for platform authenticators
   */
  @Get('.well-known/apple-app-site-association')
  @Header('Content-Type', 'application/json')
  appleAppSiteAssociation() {
    return {
      webcredentials: {
        apps: [],
      },
    };
  }

  @Get('.well-known/jwks.json')
  @Header('Content-Type', 'application/json')
  jwks() {
    return this.jwksService.getJwks();
  }

  @Get('.well-known/openid-configuration')
  openidConfiguration() {
    const issuer = this.configService.get<string>(
      'OIDC_ISSUER',
      'https://auth.inite.ai',
    );

    return {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      userinfo_endpoint: `${issuer}/oauth/userinfo`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      introspection_endpoint: `${issuer}/oauth/introspect`,
      end_session_endpoint: `${issuer}/oauth/logout`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: [
        'client_secret_post',
      ],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
      claims_supported: [
        'sub',
        'email',
        'email_verified',
        'name',
        'picture',
        'roles',
      ],
    };
  }
}





