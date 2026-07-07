import { Controller, Get, Header, HttpStatus, HttpException, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { JwksService } from './jwks.service';
import { DbHealthService } from './db-health.service';
import { RedisService } from './redis.service';
import { MetricsService } from './metrics.service';

@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly configService: ConfigService,
    private readonly jwksService: JwksService,
    private readonly dbHealth: DbHealthService,
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
      version: '1.1.0',
    };
  }

  @Get('ready')
  async ready() {
    const checks: Record<string, { ok: boolean; error?: string; latencyMs?: number }> = {};

    const start = Date.now();
    try {
      await this.dbHealth.ping();
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
    return this.authServerMetadata(this.issuer());
  }

  /**
   * RFC 8414 — Authorization Server Metadata served at the OAuth-AS
   * well-known path. MCP clients (and other RFC 8414-only consumers)
   * look here rather than at the OIDC discovery path, so we serve the
   * identical document at both locations.
   */
  @Get('.well-known/oauth-authorization-server')
  @Header('Content-Type', 'application/json')
  oauthAuthorizationServer() {
    return this.authServerMetadata(this.issuer());
  }

  /**
   * RFC 9728 — Protected Resource Metadata. Tells MCP clients which
   * authorization server protects this resource and how to present
   * bearer tokens.
   */
  @Get('.well-known/oauth-protected-resource')
  @Header('Content-Type', 'application/json')
  oauthProtectedResource() {
    const issuer = this.issuer();
    return {
      resource: issuer,
      authorization_servers: [issuer],
      scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
      bearer_methods_supported: ['header'],
      resource_documentation: `${issuer}/docs`,
    };
  }

  private issuer(): string {
    return this.configService.get<string>(
      'OIDC_ISSUER',
      'http://localhost:3002',
    );
  }

  private authServerMetadata(issuer: string) {
    return {
      issuer,
      authorization_endpoint: `${issuer}/v1/oauth/authorize`,
      token_endpoint: `${issuer}/v1/oauth/token`,
      userinfo_endpoint: `${issuer}/v1/oauth/userinfo`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      registration_endpoint: `${issuer}/v1/oauth/register`,
      revocation_endpoint: `${issuer}/v1/oauth/revoke`,
      introspection_endpoint: `${issuer}/v1/oauth/introspect`,
      end_session_endpoint: `${issuer}/v1/oauth/logout`,
      pushed_authorization_request_endpoint: `${issuer}/v1/oauth/par`,
      device_authorization_endpoint: `${issuer}/v1/oauth/device_authorization`,
      // RFC 9126 §5: when set, the IdP rejects /authorize requests
      // for THIS client that don't come via /par. We don't enforce
      // globally — operators flip this per-client via an admin
      // flag when they need FAPI-grade hardening.
      require_pushed_authorization_requests: false,
      response_types_supported: ['code'],
      grant_types_supported: [
        'authorization_code',
        'refresh_token',
        'client_credentials',
        'urn:ietf:params:oauth:grant-type:device_code',
        'urn:ietf:params:oauth:grant-type:token-exchange',
      ],
      // RFC 8693 Token Exchange token types we accept/issue.
      'token-exchange': {
        subject_token_types_supported: [
          'urn:ietf:params:oauth:token-type:access_token',
          'urn:ietf:params:oauth:token-type:jwt',
        ],
      },
      // OIDC acr the step-up enforcement understands (see StepUpService).
      acr_values_supported: ['aal1', 'aal2', 'phr'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: [
        'client_secret_post',
        'private_key_jwt',
        'none',
      ],
      // Asymmetric algs accepted for a private_key_jwt client assertion.
      token_endpoint_auth_signing_alg_values_supported: [
        'RS256', 'PS256', 'ES256', 'EdDSA',
      ],
      // JAR (RFC 9101) — signed request objects on /authorize + /par.
      request_parameter_supported: true,
      request_uri_parameter_supported: true,
      require_request_uri_registration: false,
      request_object_signing_alg_values_supported: [
        'RS256', 'PS256', 'ES256', 'EdDSA',
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
        'nonce',
        'amr',
        'acr',
      ],
      // Back-channel logout — RP can register backchannel_logout_uri
      // on its OAuth client; IdP fans out signed logout_tokens on
      // /oauth/logout.
      backchannel_logout_supported: true,
      backchannel_logout_session_supported: true,
      // RFC 9449. Listing the algorithms our DPoP verifier accepts
      // tells SDK authors which key types to mint for M2M clients.
      dpop_signing_alg_values_supported: ['ES256', 'ES384', 'ES512', 'EdDSA'],
    };
  }
}





