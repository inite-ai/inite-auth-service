import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { OAuthClient } from "@prisma/client";
import { IdempotencyInterceptor } from "../common/idempotency.interceptor";
import { TokenEndpointThrottlerGuard } from "./token-throttler.guard";
import { OAuthClientRegistryService } from "./oauth-client-registry.service";
import { ClientAuthService } from "./client-auth.service";
import { DeviceFlowService } from "./device-flow.service";
import { OAuthAuditService } from "../audit/oauth-audit.service";
import { MetricsService } from "../common/metrics.service";
import { LoggerService } from "../common/logger.service";
import { TokenRequestBody } from "./dto/oauth-requests";
import { TokenGrantService } from "./token-grant.service";
import { AuditCtx, clientContext, TOKEN_EXCHANGE_GRANT } from "./token-support";

/**
 * OAuth 2.0 token endpoint. Thin HTTP dispatch: authenticate the client,
 * assert the grant is allowed, then delegate to TokenGrantService. Shares the
 * /v1/oauth route prefix with OAuthController.
 */
@ApiTags("oauth")
@Controller({ path: "oauth", version: "1" })
export class TokenController {
  private readonly logger = new LoggerService();

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly clientRegistry: OAuthClientRegistryService,
    private readonly audit: OAuthAuditService,
    private readonly metrics: MetricsService,
    private readonly grants: TokenGrantService,
    private readonly clientAuth: ClientAuthService,
  ) {
    this.logger.setContext("TokenController");
  }

  /**
   * Token endpoint
   * POST /oauth/token
   */
  @Post('token')
  @UseGuards(TokenEndpointThrottlerGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async token(@Body() body: TokenRequestBody, @Req() req: Request) {
    const grantType = body.grant_type;
    const ctx = clientContext(req);

    // Latency timer scoped to grant_type; endTimer runs on every
    // return/throw via finally so the histogram never loses samples.
    const endTimer = this.metrics.tokenLatency.startTimer({
      grant_type: grantType || 'unknown',
    });

    try {
      if (!grantType) {
        this.metrics.tokenFailures.inc({ grant_type: 'unknown', reason: 'missing_grant' });
        throw new BadRequestException('grant_type is required');
      }

      const client = await this.authenticateTokenClient(body, ctx, grantType);
      await this.assertGrantAllowed(client, grantType, ctx);

      switch (grantType) {
        case 'authorization_code':
          return await this.grants.grantAuthorizationCode(body, client, ctx);
        case 'refresh_token':
          return await this.grants.grantRefreshToken(body, client, ctx);
        case DeviceFlowService.GRANT_TYPE:
          return await this.grants.grantDeviceCode({ req, body, client, ctx });
        case 'client_credentials':
          return await this.grants.grantClientCredentials({ req, body, client, ctx });
        case TOKEN_EXCHANGE_GRANT:
          return await this.grants.grantTokenExchange(body, client, ctx);
        default:
          throw new BadRequestException('Unsupported grant_type');
      }
    } finally {
      endTimer();
    }
  }


  /**
   * Authenticate the calling client. Audit-logs a credential failure even
   * when the client is unknown (IP/UA still tells the operator who's probing).
   */
  private async authenticateTokenClient(
    body: TokenRequestBody,
    ctx: AuditCtx,
    grantType: string,
  ): Promise<OAuthClient> {
    try {
      // Dispatches to private_key_jwt (RFC 7523) when a client_assertion is
      // present, else the shared-secret path.
      return await this.clientAuth.authenticate({
        body,
        audiences: this.clientAuth.tokenAudiences(),
      });
    } catch (e: unknown) {
      this.metrics.tokenFailures.inc({ grant_type: grantType, reason: 'invalid_credentials' });
      await this.audit.record({
        event: 'token.failed.invalid_credentials',
        clientId: body.client_id ?? null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        success: false,
        errorMessage: e instanceof Error ? e.message : 'unknown',
        metadata: { grantType },
      });
      throw e;
    }
  }

  private async assertGrantAllowed(
    client: OAuthClient,
    grantType: string,
    ctx: AuditCtx,
  ): Promise<void> {
    try {
      this.clientRegistry.validateGrantType(client, grantType);
    } catch (e: unknown) {
      this.metrics.tokenFailures.inc({ grant_type: grantType, reason: 'unsupported_grant' });
      await this.audit.record({
        event: 'token.failed.unsupported_grant',
        clientId: client.clientId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        success: false,
        errorMessage: e instanceof Error ? e.message : 'unknown',
        metadata: { grantType },
      });
      throw e;
    }
  }
}
