import { Controller, Get, Header, HttpCode, HttpStatus, HttpException, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { JwksService } from './jwks.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from './redis.service';
import { MetricsService } from './metrics.service';

@Controller({ version: VERSION_NEUTRAL })
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
      version: '1.1.0',
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
    const issuer = this.getIssuer();

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
      ],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: [
        'client_secret_post',
        // "none" enabled for RFC 7591 public clients (DCR-registered
        // MCP/native callers using PKCE without a secret).
        'none',
      ],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['openid', 'profile', 'email', 'offline_access', 'mcp:audit'],
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

  /**
   * OAuth 2.0 Authorization Server Metadata (RFC 8414).
   *
   * MCP clients (Claude Code et al.) discover the auth server through
   * this endpoint rather than the OIDC one — RFC 8414 is the OAuth-side
   * twin of openid-configuration. The advertised metadata MUST agree
   * with what's implemented, so the two endpoints overlap intentionally;
   * they're only separate to satisfy clients that look for one and not
   * the other.
   *
   * Notable additions vs. openid-configuration:
   *   - registration_endpoint  (RFC 7591 DCR)
   *   - "none" in token_endpoint_auth_methods_supported (public clients)
   *   - mcp:audit advertised as a supported scope
   *   - no OIDC-only fields (no id_token, no userinfo, no subject_types)
   */
  @Get('.well-known/oauth-authorization-server')
  oauthAuthorizationServer() {
    const issuer = this.getIssuer();

    return {
      issuer,
      authorization_endpoint: `${issuer}/v1/oauth/authorize`,
      token_endpoint: `${issuer}/v1/oauth/token`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      registration_endpoint: `${issuer}/v1/oauth/register`,
      revocation_endpoint: `${issuer}/v1/oauth/revoke`,
      introspection_endpoint: `${issuer}/v1/oauth/introspect`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['openid', 'profile', 'email', 'offline_access', 'mcp:audit'],
      // RFC 9449 — DPoP-bound access tokens. MCP clients SHOULD use
      // DPoP per the MCP authorization spec, so advertise it.
      dpop_signing_alg_values_supported: ['ES256', 'ES384', 'ES512', 'EdDSA'],
      revocation_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      introspection_endpoint_auth_methods_supported: ['client_secret_post'],
    };
  }

  /** Single source of truth for the issuer URL across both discovery docs. */
  private getIssuer(): string {
    return this.configService.get<string>('OIDC_ISSUER', 'https://auth.inite.ai');
  }
}





