import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { OAuthClientRegistryService } from './oauth-client-registry.service';
import { ClientAuthService } from './client-auth.service';
import { RequestObjectService } from './request-object.service';
import { JwtOrSessionGuard } from '../auth/guards/jwt-or-session.guard';
import { ParService } from './par.service';
import { DeviceFlowService } from './device-flow.service';
import { AuthorizeQuery } from './dto/oauth-requests';


@ApiTags('oauth')
@Controller({ path: 'oauth', version: '1' })
export class OAuthRequestController {
  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly clientRegistry: OAuthClientRegistryService,
    private readonly par: ParService,
    private readonly deviceFlow: DeviceFlowService,
    private readonly clientAuth: ClientAuthService,
    private readonly requestObject: RequestObjectService,
  ) {}

  /**
   * Pushed Authorization Requests (RFC 9126).
   * POST /v1/oauth/par
   *
   * Confidential authentication via client_secret_post; on success
   * returns a `request_uri` (single-use, 60 s TTL) which the client
   * hands to the user agent on /authorize.
   */
  @Post('par')
  @UseInterceptors(IdempotencyInterceptor)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async pushAuthorization(@Body() body: AuthorizeQuery) {
    const clientId = body.client_id;
    if (!clientId) throw new BadRequestException('client_id is required');
    // Supports client_secret_post and private_key_jwt (RFC 7523).
    await this.clientAuth.authenticate({
      body,
      audiences: this.clientAuth.parAudiences(),
    });

    // JAR (RFC 9101): a signed request object's claims take precedence over
    // the form params. Verified against the authenticated client's keys.
    const p = body.request
      ? { ...body, ...(await this.resolveRequestObject(body.request, clientId)) }
      : body;

    return {
      request_uri: (
        await this.par.push({
          clientId,
          // par.push rejects a missing redirect_uri with the same 400 whether
          // it arrives as undefined or ''; coercing keeps the type strict.
          redirectUri: p.redirect_uri ?? '',
          responseType: p.response_type,
          scope: p.scope,
          state: p.state,
          codeChallenge: p.code_challenge,
          codeChallengeMethod: p.code_challenge_method,
          nonce: p.nonce,
          acrValues: p.acr_values,
          prompt: p.prompt,
        })
      ).requestUri,
      expires_in: 60,
    };
  }

  private async resolveRequestObject(request: string, clientId: string): Promise<Partial<AuthorizeQuery>> {
    return this.requestObject.resolve({ request, clientId });
  }

  /**
   * Device Authorization Grant (RFC 8628) — step 1.
   * POST /v1/oauth/device_authorization
   *
   * The device authenticates with its client_id (public clients
   * skip client_secret per spec §3.1). We return device_code,
   * user_code, and the verification URI to display.
   */
  @Post('device_authorization')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async deviceAuthorization(
    @Body('client_id') clientId: string,
    @Body('scope') scope: string,
    @Req() req: Request,
  ) {
    if (!clientId) throw new BadRequestException('client_id is required');
    const client = await this.clientRegistry.validateClient(clientId);
    this.clientRegistry.validateGrantType(client, DeviceFlowService.GRANT_TYPE);

    const proto = (req.headers['x-forwarded-proto'] as string | undefined)
      ?? req.protocol
      ?? 'https';
    const host = req.headers.host ?? '';
    const verificationUri = `${proto}://${host}/v1/oauth/device`;
    return await this.deviceFlow.issue({
      client,
      scope,
      verificationUri,
    });
  }

  /**
   * Device verification — step 2.
   * GET /v1/oauth/device?user_code=ABCD-EFGH
   *
   * The user lands here from the URL printed by the device. We
   * resolve the user_code, then bounce the browser into the
   * /authorize-style consent flow with a synthetic auth code.
   *
   * In this codebase the actual consent UI lives on the frontend;
   * this endpoint returns the resolved client + scope so the SPA
   * can render the consent screen + POST approval back.
   */
  @Get('device')
  async deviceVerify(@Query('user_code') userCode: string) {
    if (!userCode) throw new BadRequestException('user_code is required');
    const row = await this.deviceFlow.findByUserCode(userCode);
    if (!row) {
      throw new BadRequestException('Invalid or expired user_code');
    }
    return {
      user_code: row.userCode,
      client_id: row.clientId,
      scope: row.scope ?? null,
      status: row.status,
      expires_at: row.expiresAt,
    };
  }

  /**
   * Device verification — approval step.
   * POST /v1/oauth/device/approve  body: { user_code, decision }
   *
   * Requires an authenticated browser session. decision = 'approve'
   * flips the device row to approved, attaching the user; 'deny'
   * marks denied so the device's next poll returns access_denied.
   */
  @Post('device/approve')
  @UseGuards(JwtOrSessionGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async deviceApprove(
    @Body() body: { user_code: string; decision: 'approve' | 'deny' },
    @Req() req: Request,
  ) {
    if (!body?.user_code) throw new BadRequestException('user_code is required');
    if (body.decision === 'deny') {
      await this.deviceFlow.deny(body.user_code);
      return { status: 'denied' };
    }
    // JwtOrSessionGuard sets req.user from either the JWT principal or a bare
    // { userId } derived from the session; we read only userId here.
    const updated = await this.deviceFlow.approve({
      userCode: body.user_code,
      // JwtOrSessionGuard guarantees req.user carries a userId.
      userId: (req.user as { userId: string }).userId,
    });
    return { status: updated.status };
  }
}
