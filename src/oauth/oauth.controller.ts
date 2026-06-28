import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  Req,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { Throttle } from '@nestjs/throttler';
import { TokenEndpointThrottlerGuard } from './token-throttler.guard';
import { ClientIdThrottlerGuard } from './client-throttler.guard';
import { Response, Request } from 'express';
import { OAuthService } from './oauth.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtOrSessionGuard } from '../auth/guards/jwt-or-session.guard';
import { LoggerService } from '../common/logger.service';
import { CreateCodeInput } from './dto/create-code.input';
import {
  AuthorizeQuery,
  ResolvedAuthorizeParams,
  TokenRequestBody,
} from './dto/oauth-requests';
import { OAuthAuditService } from '../audit/oauth-audit.service';
import { MetricsService } from '../common/metrics.service';
import { BackchannelLogoutService } from './backchannel-logout.service';
import { DpopService } from './dpop.service';
import { ParService } from './par.service';
import { DeviceFlowService } from './device-flow.service';
import { StepUpService } from './step-up.service';
import { OAuthClient } from '@prisma/client';

/** IP + UA pulled off the request, threaded into audit records. */
type AuditCtx = { ip: string; userAgent: string };

/** Standard OAuth token response (authorization_code / refresh / device). */
interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  idToken: string;
  scope: string;
}

/** Pulls IP + UA off the request for audit log enrichment. */
function clientContext(req: Request): AuditCtx {
  const fwd = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
  const ip = fwd.split(',')[0]?.trim() || req.ip || '';
  return {
    ip,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? '',
  };
}

@ApiTags('oauth')
@Controller({ path: 'oauth', version: '1' })
export class OAuthController {
  private readonly logger = new LoggerService();

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly oauthService: OAuthService,
    private readonly authService: AuthService,
    private readonly audit: OAuthAuditService,
    private readonly metrics: MetricsService,
    private readonly backchannelLogout: BackchannelLogoutService,
    private readonly dpop: DpopService,
    private readonly par: ParService,
    private readonly deviceFlow: DeviceFlowService,
    private readonly stepUp: StepUpService,
  ) {
    this.logger.setContext('OAuthController');
  }

  /**
   * Authorization endpoint
   * GET /oauth/authorize
   *
   * Throttled per-IP. 20/min is generous for legitimate users (a fresh
   * load + a retry handles the typical OAuth dance) but cuts off the
   * "spray client_ids to enumerate which exist" failure mode where an
   * attacker probes for valid client registrations.
   */
  @Get('authorize')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async authorize(
    @Query() query: AuthorizeQuery,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const p = await this.resolveAuthorizeParams(query);

    // Order matters: validate the basics, then the client, then PKCE —
    // preserving the original error precedence.
    this.assertAuthorizeBasics(p);
    const client = await this.oauthService.validateClient(p.clientId);
    if (!this.oauthService.validateRedirectUri(client, p.redirectUri)) {
      throw new BadRequestException('Invalid redirect_uri');
    }
    this.oauthService.validateGrantType(client, 'authorization_code');
    const grantedScope = this.oauthService.normalizeScope(p.scope || '');
    this.assertPkce(p);

    const userId = req.session?.userId;
    this.logger.oauth('Authorize request', {
      clientId: p.clientId,
      hasSession: !!req.session,
      userId: userId || 'none',
      prompt: p.prompt,
    });

    if (p.prompt === 'none') {
      return this.handleSilentSso(res, req, { params: p, grantedScope, userId });
    }
    if (!userId) {
      return this.redirectToLogin(res, req, { params: p });
    }

    // Step-up enforcement (RFC 9470 / OIDC acr_values). If the RP asked for an
    // assurance level the current session doesn't meet, bounce back to login
    // for a stronger factor instead of minting a code. The step_up hint stops
    // the SPA from silently re-using the existing (too-weak) session.
    const amr: string[] = (req.session as any)?.amr ?? [];
    if (!this.stepUp.isSatisfied(amr, p.acrValues)) {
      this.logger.oauth('Step-up required: session AAL below requested acr', {
        clientId: p.clientId,
        userId,
        requested: p.acrValues,
      });
      return this.redirectToLogin(res, req, { params: p, stepUp: true });
    }

    this.logger.oauth('Redirecting to consent', { clientId: p.clientId, userId });
    return res.redirect(this.buildClientRedirect(req, '/consent', { params: p }));
  }

  /**
   * RFC 9126: when request_uri is presented, the inbound query params are
   * ignored (other than client_id, which binds the PAR consumption) and the
   * pushed values take over. Returns the normalized, camelCase params.
   */
  // eslint-disable-next-line complexity -- TODO(complexity): decompose this function
  private async resolveAuthorizeParams(
    q: AuthorizeQuery,
  ): Promise<ResolvedAuthorizeParams> {
    let responseType = q.response_type;
    const clientId = q.client_id ?? '';
    let redirectUri = q.redirect_uri ?? '';
    let scope = q.scope;
    let state = q.state;
    let codeChallenge = q.code_challenge;
    let codeChallengeMethod = q.code_challenge_method;
    let nonce = q.nonce;
    let acrValues = q.acr_values;
    let prompt = q.prompt;

    if (q.request_uri) {
      if (!clientId) {
        throw new BadRequestException('client_id is required with request_uri');
      }
      const pushed = await this.par.consume(q.request_uri, clientId);
      if (!pushed) {
        throw new BadRequestException('Invalid or expired request_uri');
      }
      responseType = pushed.responseType ?? responseType;
      redirectUri = pushed.redirectUri;
      scope = pushed.scope ?? scope;
      state = pushed.state ?? state;
      codeChallenge = pushed.codeChallenge ?? codeChallenge;
      codeChallengeMethod = pushed.codeChallengeMethod ?? codeChallengeMethod;
      nonce = pushed.nonce ?? nonce;
      acrValues = pushed.acrValues ?? acrValues;
      prompt = pushed.prompt ?? prompt;
    }

    return {
      responseType,
      clientId,
      redirectUri,
      scope,
      state,
      codeChallenge,
      codeChallengeMethod,
      nonce,
      acrValues,
      prompt,
    };
  }

  private assertAuthorizeBasics(p: ResolvedAuthorizeParams): void {
    if (!p.responseType || p.responseType !== 'code') {
      throw new BadRequestException('Invalid response_type. Only "code" is supported.');
    }
    if (!p.clientId) {
      throw new BadRequestException('client_id is required');
    }
    if (!p.redirectUri) {
      throw new BadRequestException('redirect_uri is required');
    }
  }

  private assertPkce(p: ResolvedAuthorizeParams): void {
    if (!p.codeChallenge) {
      throw new BadRequestException('code_challenge is required (PKCE)');
    }
    // We advertise S256-only in the OIDC discovery document, so reject the
    // weaker `plain` method instead of silently accepting it.
    if (p.codeChallengeMethod && p.codeChallengeMethod !== 'S256') {
      throw new BadRequestException(
        'Only the S256 code_challenge_method is supported',
      );
    }
  }

  private async handleSilentSso(
    res: Response,
    req: Request,
    ctx: {
      params: ResolvedAuthorizeParams;
      grantedScope: string;
      userId?: string;
    },
  ) {
    const { params: p, grantedScope, userId } = ctx;
    if (!userId) {
      const errorUrl = new URL(p.redirectUri);
      errorUrl.searchParams.set('error', 'login_required');
      errorUrl.searchParams.set('error_description', 'User is not authenticated');
      if (p.state) errorUrl.searchParams.set('state', p.state);
      return res.redirect(errorUrl.toString());
    }

    const amr: string[] = (req.session as any)?.amr ?? [];

    // Step-up under prompt=none can't show UI, so we can't raise assurance
    // silently — return interaction_required per OIDC so the RP retries
    // interactively with the same acr_values.
    if (!this.stepUp.isSatisfied(amr, p.acrValues)) {
      const errorUrl = new URL(p.redirectUri);
      errorUrl.searchParams.set('error', 'interaction_required');
      errorUrl.searchParams.set(
        'error_description',
        'Requested acr_values cannot be satisfied without interaction',
      );
      if (p.state) errorUrl.searchParams.set('state', p.state);
      return res.redirect(errorUrl.toString());
    }

    const code = await this.oauthService.createAuthorizationCode({
      userId,
      clientId: p.clientId,
      redirectUri: p.redirectUri,
      scope: grantedScope,
      codeChallenge: p.codeChallenge!,
      codeChallengeMethod: p.codeChallengeMethod || 'S256',
      nonce: p.nonce!,
      // Persist the acr actually achieved (so the id_token reflects reality),
      // falling back to the requested value when we have no amr to derive it.
      acrValues: this.stepUp.achievedAcr(amr) ?? p.acrValues ?? undefined,
      amr,
    });

    this.logger.oauth('Silent SSO success', { clientId: p.clientId, userId });
    const successUrl = new URL(p.redirectUri);
    successUrl.searchParams.set('code', code);
    if (p.state) successUrl.searchParams.set('state', p.state);
    return res.redirect(successUrl.toString());
  }

  private redirectToLogin(
    res: Response,
    req: Request,
    ctx: { params: ResolvedAuthorizeParams; stepUp?: boolean },
  ) {
    const p = ctx.params;
    if (!req.session) {
      req.session = {} as any;
    }
    req.session.oauthParams = {
      clientId: p.clientId,
      redirectUri: p.redirectUri,
      scope: p.scope,
      state: p.state,
      codeChallenge: p.codeChallenge,
      codeChallengeMethod: p.codeChallengeMethod,
      nonce: p.nonce,
    };
    this.logger.oauth('Redirecting to login', {
      clientId: p.clientId,
      stepUp: !!ctx.stepUp,
    });
    return res.redirect(
      this.buildClientRedirect(req, '/login', {
        params: p,
        stepUp: ctx.stepUp,
      }),
    );
  }

  /** Build a /login or /consent redirect carrying the OAuth params forward. */
  private buildClientRedirect(
    req: Request,
    path: string,
    ctx: { params: ResolvedAuthorizeParams; stepUp?: boolean },
  ): string {
    const p = ctx.params;
    const url = new URL(path, process.env.FRONTEND_URL || `https://${req.headers.host}`);
    url.searchParams.set('client_id', p.clientId);
    url.searchParams.set('redirect_uri', p.redirectUri);
    if (p.scope) url.searchParams.set('scope', p.scope);
    if (p.state) url.searchParams.set('state', p.state);
    if (p.codeChallenge) url.searchParams.set('code_challenge', p.codeChallenge);
    if (p.codeChallengeMethod) {
      url.searchParams.set('code_challenge_method', p.codeChallengeMethod);
    }
    if (p.nonce) url.searchParams.set('nonce', p.nonce);
    // Carry acr_values so the resumed /authorize re-checks the requirement,
    // and step_up so the SPA forces a fresh, stronger factor.
    if (p.acrValues) url.searchParams.set('acr_values', p.acrValues);
    if (ctx.stepUp) url.searchParams.set('step_up', '1');
    return url.toString();
  }

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
  async pushAuthorization(@Body() body: Record<string, any>) {
    const clientId = body.client_id;
    const clientSecret = body.client_secret;
    if (!clientId) throw new BadRequestException('client_id is required');
    await this.oauthService.validateClientWithSecret(clientId, clientSecret);

    return {
      request_uri: (
        await this.par.push({
          clientId,
          redirectUri: body.redirect_uri,
          responseType: body.response_type,
          scope: body.scope,
          state: body.state,
          codeChallenge: body.code_challenge,
          codeChallengeMethod: body.code_challenge_method,
          nonce: body.nonce,
          acrValues: body.acr_values,
          prompt: body.prompt,
        })
      ).requestUri,
      expires_in: 60,
    };
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
    const client = await this.oauthService.validateClient(clientId);
    this.oauthService.validateGrantType(client, DeviceFlowService.GRANT_TYPE);

    const proto = (req.headers['x-forwarded-proto'] as string | undefined)
      ?? (req as any).protocol
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
    @Req() req: any,
  ) {
    if (!body?.user_code) throw new BadRequestException('user_code is required');
    if (body.decision === 'deny') {
      await this.deviceFlow.deny(body.user_code);
      return { status: 'denied' };
    }
    const updated = await this.deviceFlow.approve({
      userCode: body.user_code,
      userId: req.user.userId,
    });
    return { status: updated.status };
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
          return await this.grantAuthorizationCode(body, client, ctx);
        case 'refresh_token':
          return await this.grantRefreshToken(body, client, ctx);
        case DeviceFlowService.GRANT_TYPE:
          return await this.grantDeviceCode(req, body, client, ctx);
        case 'client_credentials':
          return await this.grantClientCredentials(req, body, client, ctx);
        default:
          throw new BadRequestException('Unsupported grant_type');
      }
    } finally {
      endTimer();
    }
  }

  /** Standard authorization_code / refresh_token / device response shape. */
  private toTokenResponse(tokens: IssuedTokens) {
    return {
      access_token: tokens.accessToken,
      token_type: 'Bearer',
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      id_token: tokens.idToken,
      scope: tokens.scope,
    };
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
      return await this.oauthService.validateClientWithSecret(
        body.client_id as string,
        body.client_secret as string,
      );
    } catch (e: any) {
      this.metrics.tokenFailures.inc({ grant_type: grantType, reason: 'invalid_credentials' });
      await this.audit.record({
        event: 'token.failed.invalid_credentials',
        clientId: body.client_id ?? null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        success: false,
        errorMessage: e?.message ?? 'unknown',
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
      this.oauthService.validateGrantType(client, grantType);
    } catch (e: any) {
      this.metrics.tokenFailures.inc({ grant_type: grantType, reason: 'unsupported_grant' });
      await this.audit.record({
        event: 'token.failed.unsupported_grant',
        clientId: client.clientId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        success: false,
        errorMessage: e?.message ?? 'unknown',
        metadata: { grantType },
      });
      throw e;
    }
  }

  private async grantAuthorizationCode(
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

  private async grantRefreshToken(
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
  private async grantDeviceCode(
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
  private async grantClientCredentials(
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
   * User info endpoint (OIDC)
   */
  @Get('userinfo')
  @UseGuards(JwtAuthGuard)
  async userinfo(@Req() req: any) {
    return await this.oauthService.getUserInfo(req.user.userId);
  }

  /**
   * Token revocation endpoint
   *
   * Keyed per client_id so one misbehaving client can't starve revoke
   * for the rest. 30/min lets legitimate "user logged out, revoke all
   * their refresh tokens" cleanup run through; an attacker burning
   * credentials trying to guess valid tokens trips the limit fast.
   */
  @Post('revoke')
  @UseGuards(ClientIdThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async revoke(
    @Body('token') token: string,
    @Body('client_id') clientId: string,
    @Body('client_secret') clientSecret: string,
  ) {
    if (!token) throw new BadRequestException('token is required');

    await this.oauthService.validateClientWithSecret(clientId, clientSecret);
    await this.oauthService.revokeToken(token, clientId);

    this.logger.oauth('Token revoked', { clientId });
    return { success: true };
  }

  /**
   * Token introspection endpoint (RFC 7662)
   *
   * Per-client throttle for the same reason as /revoke. 60/min — more
   * generous because RSes legitimately introspect on every request and
   * cache only briefly.
   */
  @Post('introspect')
  @UseGuards(ClientIdThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async introspect(
    @Body('token') token: string,
    @Body('client_id') clientId: string,
    @Body('client_secret') clientSecret: string,
  ) {
    if (!token) throw new BadRequestException('token is required');

    await this.oauthService.validateClientWithSecret(clientId, clientSecret);

    try {
      const payload = await this.authService.verifyToken(token);
      return {
        active: true,
        sub: payload.sub,
        client_id: payload.aud,
        scope: payload.scope || '',
        exp: payload.exp,
        iat: payload.iat,
        iss: payload.iss,
        // RFC 9449 §6.1: surface the JWK thumbprint so an RS that
        // happens to call introspect (rare for M2M, but legal) can
        // also verify sender-constraint.
        ...(payload.cnf ? { cnf: payload.cnf, token_type: 'DPoP' } : { token_type: 'Bearer' }),
      };
    } catch {
      return { active: false };
    }
  }

  /**
   * Logout endpoint
   */
  // eslint-disable-next-line max-params, complexity -- NestJS route handler (param decorators); TODO(complexity): decompose
  @Get('logout')
  async logout(
    @Query('post_logout_redirect_uri') postLogoutRedirectUri: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Capture identity + session id BEFORE we destroy the session,
    // so back-channel logout has something to put in `sub`/`sid`.
    let userDid: string | null = null;
    const sid: string | undefined = req.session?.id;
    const userId = req.session?.userId;
    if (userId) {
      try {
        userDid = await this.oauthService.getUserDid(userId);
      } catch (e: any) {
        this.logger.warn(`Logout: could not resolve userDid: ${e?.message}`);
      }
    }

    // Destroy session
    if (req.session) {
      await new Promise<void>((resolve) => {
        req.session.destroy((err) => {
          if (err) this.logger.error('Session destroy error', err.message);
          else this.logger.session('Destroyed on logout');
          resolve();
        });
      });
    }

    // Clear session cookie
    res.clearCookie('inite.sid');

    // Best-effort fan-out to RPs with backchannel_logout_uri set.
    // Bounded by per-call timeout in the service so a slow RP can't
    // delay the user's redirect indefinitely.
    if (userDid) {
      this.backchannelLogout
        .fanOut({ userDid, sid })
        .then((count) =>
          this.logger.session('Back-channel logout fan-out', {
            recipients: count,
            sub: userDid,
          }),
        )
        .catch((e) =>
          this.logger.warn(
            `Back-channel fan-out error: ${e?.message ?? 'unknown'}`,
          ),
        );
    }

    const frontendUrl = this.oauthService.getFrontendUrl();

    if (postLogoutRedirectUri) {
      try {
        const url = new URL(postLogoutRedirectUri);
        const isAllowed = await this.oauthService.isAllowedOrigin(url.origin);
        if (isAllowed) {
          if (state) url.searchParams.set('state', state);
          return res.redirect(url.toString());
        }
        this.logger.warn('Logout redirect blocked', {
          uri: postLogoutRedirectUri,
          origin: url.origin,
        });
      } catch { /* invalid URL */ }
    }

    return res.redirect(frontendUrl || '/');
  }

  /**
   * Create authorization code (for frontend flows)
   */
  /**
   * Get public client info (for consent page)
   *
   * Throttled to prevent enumeration of registered clientIds by anyone
   * who can reach the endpoint. Legitimate consent page loads it once
   * per session.
   */
  @Get('client-info')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async clientInfo(@Query('client_id') clientId: string) {
    if (!clientId) throw new BadRequestException('client_id is required');
    return await this.oauthService.getClientInfo(clientId);
  }

  @Post('create-code')
  @UseGuards(JwtOrSessionGuard)
  async createCode(@Req() req: any, @Body() input: CreateCodeInput) {
    const client = await this.oauthService.validateClient(input.clientId);

    if (!this.oauthService.validateRedirectUri(client, input.redirectUri)) {
      throw new BadRequestException('Invalid redirect_uri');
    }

    if (!input.codeChallenge) {
      throw new BadRequestException('code_challenge is required (PKCE)');
    }

    const grantedScope = this.oauthService.normalizeScope(input.scope || '');

    // Step-up: record the acr the session ACTUALLY achieved (from amr), not the
    // client-requested value — an RP requiring aal2 then rejects an id_token
    // whose acr is only aal1. When acr_values is supplied and unmet, refuse the
    // code outright so a client can't skip the /authorize step-up gate.
    const amr: string[] = (req.session as any)?.amr ?? [];
    if (!this.stepUp.isSatisfied(amr, input.acrValues)) {
      throw new UnauthorizedException({
        error: 'insufficient_user_authentication',
        error_description:
          'Requested acr_values exceeds the current session assurance level',
        acr_values: input.acrValues,
      });
    }

    const code = await this.oauthService.createAuthorizationCode({
      userId: req.user.userId,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      scope: grantedScope,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod || 'S256',
      nonce: input.nonce,
      acrValues: this.stepUp.achievedAcr(amr) ?? input.acrValues,
      amr,
    });

    this.logger.oauth('Code created', { clientId: input.clientId, userId: req.user.userId });
    return { code };
  }

  /**
   * Set session from JWT token (SSO helper)
   */
  // eslint-disable-next-line max-params -- NestJS route handler (parameters are @Body/@Req/@Res/@Param/@Query)
  @Get('session')
  async setSession(
    @Query('token') token: string,
    @Query('redirect') redirect: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!token) throw new BadRequestException('token is required');

    try {
      const payload = await this.authService.verifyToken(token);
      
      if (req.session) {
        req.session.userId = payload.userId;
        this.logger.session('Set from token', { sessionId: req.session.id, userId: payload.userId });
      }

      if (redirect) {
        try {
          const url = new URL(redirect);
          const isAllowed = await this.oauthService.isAllowedOrigin(url.origin);
          if (isAllowed) return res.redirect(redirect);
        } catch { /* invalid URL, ignore redirect */ }
      }
      return res.json({ success: true, message: 'Session established' });
    } catch (error: any) {
      this.logger.error('Token verification failed', error.message);
      throw new UnauthorizedException('Invalid token');
    }
  }
}
