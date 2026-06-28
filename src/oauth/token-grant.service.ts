import { Injectable, BadRequestException } from "@nestjs/common";
import { Request } from "express";
import { OAuthClient } from "@prisma/client";
import { OAuthService } from "./oauth.service";
import { DeviceFlowService } from "./device-flow.service";
import { DpopService } from "./dpop.service";
import { OAuthAuditService } from "../audit/oauth-audit.service";
import { MetricsService } from "../common/metrics.service";
import { LoggerService } from "../common/logger.service";
import { TokenRequestBody } from "./dto/oauth-requests";
import { AuditCtx, IssuedTokens } from "./token-support";

/**
 * OAuth 2.0 grant handlers (authorization_code, refresh_token, device_code,
 * client_credentials, token-exchange) + DPoP binding, split out of
 * TokenController to keep both files within the size gate.
 */
@Injectable()
export class TokenGrantService {
  private readonly logger = new LoggerService();

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly oauthService: OAuthService,
    private readonly audit: OAuthAuditService,
    private readonly metrics: MetricsService,
    private readonly dpop: DpopService,
    private readonly deviceFlow: DeviceFlowService,
  ) {
    this.logger.setContext("TokenGrantService");
  }

  /** Standard authorization_code / refresh_token / device response shape. */
  toTokenResponse(tokens: IssuedTokens) {
    return {
      access_token: tokens.accessToken,
      token_type: 'Bearer',
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      id_token: tokens.idToken,
      scope: tokens.scope,
    };
  }

  async grantAuthorizationCode(
    body: TokenRequestBody,
    client: OAuthClient,
    ctx: AuditCtx,
  ) {
    const { code, redirect_uri: redirectUri, client_id: clientId, code_verifier: codeVerifier } = body;
    if (!code) throw new BadRequestException('code is required');
    if (!redirectUri) throw new BadRequestException('redirect_uri is required');
    if (!codeVerifier) throw new BadRequestException('code_verifier is required (PKCE)');

    const tokens = await this.oauthService.exchangeAuthorizationCode(
      code, clientId as string, redirectUri, codeVerifier,
    );

    this.metrics.tokensIssued.inc({ grant_type: 'authorization_code' });
    this.logger.oauth('Token issued', { clientId, grantType: 'authorization_code' });
    await this.audit.record({
      event: 'token.issued.authorization_code',
      clientId: client.clientId,
      scopes: tokens.scope ? tokens.scope.split(' ') : [],
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      success: true,
    });

    return this.toTokenResponse(tokens);
  }

  async grantRefreshToken(
    body: TokenRequestBody,
    client: OAuthClient,
    ctx: AuditCtx,
  ) {
    const clientId = body.client_id;
    if (!body.refresh_token) throw new BadRequestException('refresh_token is required');

    const tokens = await this.oauthService.refreshAccessToken(
      body.refresh_token, clientId as string,
    );

    this.metrics.tokensIssued.inc({ grant_type: 'refresh_token' });
    this.logger.oauth('Token refreshed', { clientId });
    await this.audit.record({
      event: 'token.refreshed',
      clientId: client.clientId,
      scopes: tokens.scope ? tokens.scope.split(' ') : [],
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      success: true,
    });

    return this.toTokenResponse(tokens);
  }

  // eslint-disable-next-line max-params -- TODO(par-max): pass an options object / contract
  async grantDeviceCode(
    req: Request,
    body: TokenRequestBody,
    client: OAuthClient,
    ctx: AuditCtx,
  ) {
    const clientId = body.client_id;
    const deviceCode = (req.body as any)?.device_code as string | undefined;
    if (!deviceCode) throw new BadRequestException('device_code is required');

    const approved = await this.deviceFlow.pollForApproval({
      deviceCode,
      clientId: clientId as string,
    });

    const user = await this.oauthService.findUserById(approved.userId!);
    if (!user) throw new BadRequestException({ error: 'invalid_grant' });

    const tokens = await this.oauthService.generateTokens(
      user,
      clientId as string,
      approved.scope ?? '',
    );

    this.metrics.tokensIssued.inc({ grant_type: 'device_code' });
    await this.audit.record({
      event: 'token.issued.device_code',
      clientId: client.clientId,
      sub: user.did,
      scopes: tokens.scope ? tokens.scope.split(' ') : [],
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      success: true,
    });

    return this.toTokenResponse(tokens);
  }

  /**
   * RFC 9449 — a `DPoP` proof header opts the caller into sender-constrained
   * tokens. Returns the SHA-256(jwk) thumbprint to bind into `cnf.jkt`, or
   * undefined when no proof is presented.
   */
  // eslint-disable-next-line complexity -- TODO(complexity): decompose this function
  private async resolveDpopJkt(
    req: Request,
    client: OAuthClient,
    ctx: AuditCtx,
  ): Promise<string | undefined> {
    const dpopHeader = (req.headers['dpop'] as string | undefined) ?? null;
    if (!dpopHeader) return undefined;

    const proto = (req.headers['x-forwarded-proto'] as string | undefined)
      ?? (req as any).protocol
      ?? 'https';
    const host = req.headers.host ?? '';
    const fullUrl = `${proto}://${host}${req.path ?? req.url?.split('?')[0] ?? ''}`;
    try {
      const result = await this.dpop.validate(dpopHeader, 'POST', fullUrl);
      return result.jkt;
    } catch (e: any) {
      this.metrics.tokenFailures.inc({
        grant_type: 'client_credentials',
        reason: 'dpop_invalid',
      });
      await this.audit.record({
        event: 'token.failed.dpop_invalid',
        clientId: client.clientId,
        sub: client.companyId ?? client.clientId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        success: false,
        errorMessage: e?.message ?? 'unknown',
      });
      throw e;
    }
  }

  // eslint-disable-next-line max-params -- TODO(par-max): pass an options object / contract
  async grantClientCredentials(
    req: Request,
    body: TokenRequestBody,
    client: OAuthClient,
    ctx: AuditCtx,
  ) {
    const dpopJkt = await this.resolveDpopJkt(req, client, ctx);

    let tokens;
    try {
      tokens = await this.oauthService.issueClientCredentialsToken(
        client,
        body.scope as string,
        body.audience as string,
        dpopJkt,
      );
    } catch (e: any) {
      // Scope or audience violation — both surface as BadRequestException
      // from the service. Distinguish via the message for clearer replay.
      const msg = e?.message ?? '';
      const isAudience = msg.includes('Audience');
      const event = isAudience
        ? 'token.failed.audience_violation'
        : 'token.failed.scope_violation';
      this.metrics.tokenFailures.inc({
        grant_type: 'client_credentials',
        reason: isAudience ? 'audience_violation' : 'scope_violation',
      });
      await this.audit.record({
        event,
        clientId: client.clientId,
        sub: client.companyId ?? client.clientId,
        audience: body.audience ?? null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        success: false,
        errorMessage: msg,
      });
      throw e;
    }

    this.metrics.tokensIssued.inc({ grant_type: 'client_credentials' });
    this.logger.oauth('M2M token issued', {
      clientId: body.client_id,
      scope: tokens.scope,
      audience: tokens.audience,
    });
    await this.audit.record({
      event: 'token.issued.client_credentials',
      clientId: client.clientId,
      sub: client.companyId ?? client.clientId,
      scopes: tokens.scope.split(' ').filter(Boolean),
      audience: tokens.audience,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      success: true,
    });

    return {
      access_token: tokens.accessToken,
      token_type: tokens.tokenType,
      expires_in: tokens.expiresIn,
      scope: tokens.scope,
    };
  }

  /**
   * RFC 8693 Token Exchange. Exchanges a subject_token for a downscoped access
   * token carrying an `act` claim (agent on-behalf-of delegation). The calling
   * client must have the token-exchange grant in allowedGrants (enforced by
   * assertGrantAllowed before we get here).
   */
  async grantTokenExchange(
    body: TokenRequestBody,
    client: OAuthClient,
    ctx: AuditCtx,
  ) {
    if (!body.subject_token || !body.subject_token_type) {
      this.metrics.tokenFailures.inc({
        grant_type: 'token_exchange',
        reason: 'invalid_request',
      });
      throw new BadRequestException(
        'subject_token and subject_token_type are required',
      );
    }

    let result;
    try {
      result = await this.oauthService.exchangeToken({
        client,
        subjectToken: body.subject_token,
        subjectTokenType: body.subject_token_type,
        actorToken: body.actor_token,
        actorTokenType: body.actor_token_type,
        requestedScope: body.scope,
        resource: body.resource,
        audience: body.audience,
      });
    } catch (e: any) {
      this.metrics.tokenFailures.inc({
        grant_type: 'token_exchange',
        reason: 'exchange_denied',
      });
      await this.audit.record({
        event: 'token.failed.token_exchange',
        clientId: client.clientId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        success: false,
        errorMessage: e?.message ?? 'unknown',
      });
      throw e;
    }

    this.metrics.tokensIssued.inc({ grant_type: 'token_exchange' });
    await this.audit.record({
      event: 'token.issued.token_exchange',
      clientId: client.clientId,
      scopes: result.scope.split(' ').filter(Boolean),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      success: true,
    });

    return {
      access_token: result.accessToken,
      issued_token_type: result.issuedTokenType,
      token_type: result.tokenType,
      expires_in: result.expiresIn,
      scope: result.scope,
    };
  }
}
