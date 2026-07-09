import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  Req,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { ClientIdThrottlerGuard } from './client-throttler.guard';
import { OAuthService } from './oauth.service';
import { OAuthClientRegistryService } from './oauth-client-registry.service';
import { OAuthTokenIssuerService } from './oauth-token-issuer.service';
import { OAuthOriginsService } from './oauth-origins.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtOrSessionGuard } from '../auth/guards/jwt-or-session.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';
import { LoggerService } from '../common/logger.service';
import { CreateCodeInput } from './dto/create-code.input';
import { BackchannelLogoutService } from './backchannel-logout.service';
import { StepUpService } from './step-up.service';


@ApiTags('oauth')
@Controller({ path: 'oauth', version: '1' })
export class OAuthSessionController {
  private readonly logger = new LoggerService();

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly oauthService: OAuthService,
    private readonly clientRegistry: OAuthClientRegistryService,
    private readonly tokenIssuer: OAuthTokenIssuerService,
    private readonly origins: OAuthOriginsService,
    private readonly authService: AuthService,
    private readonly backchannelLogout: BackchannelLogoutService,
    private readonly stepUp: StepUpService,
  ) {
    this.logger.setContext('OAuthSessionController');
  }

  /**
   * User info endpoint (OIDC)
   */
  @Get('userinfo')
  @UseGuards(JwtAuthGuard)
  async userinfo(@CurrentUserId() userId: string) {
    return await this.oauthService.getUserInfo(userId);
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

    await this.clientRegistry.validateClientWithSecret(clientId, clientSecret);
    await this.tokenIssuer.revokeToken(token, clientId);

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

    await this.clientRegistry.validateClientWithSecret(clientId, clientSecret);

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
  // eslint-disable-next-line max-params -- NestJS route handler (param decorators)
  @Get('logout')
  async logout(
    @Query('post_logout_redirect_uri') postLogoutRedirectUri: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Capture identity + session id BEFORE we destroy the session,
    // so back-channel logout has something to put in `sub`/`sid`.
    const sid: string | undefined = req.session?.id;
    const userId = req.session?.userId;
    const userDid = userId ? await this.resolveUserDid(userId) : null;

    await this.destroySession(req);
    res.clearCookie('inite.sid');
    if (userDid) this.fanOutBackchannel(userDid, sid);

    const target = await this.resolveLogoutRedirect(postLogoutRedirectUri, state);
    return res.redirect(target ?? (this.oauthService.getFrontendUrl() || '/'));
  }

  /** Best-effort user DID lookup (never throws — logout must always proceed). */
  private async resolveUserDid(userId: string): Promise<string | null> {
    try {
      return await this.oauthService.getUserDid(userId);
    } catch (e: unknown) {
      this.logger.warn(
        `Logout: could not resolve userDid: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /** Destroy the session (resolves even on error so logout can't hang). */
  private async destroySession(req: Request): Promise<void> {
    if (!req.session) return;
    await new Promise<void>((resolve) => {
      req.session.destroy((err) => {
        if (err) this.logger.error('Session destroy error', err.message);
        else this.logger.session('Destroyed on logout');
        resolve();
      });
    });
  }

  /**
   * Fire-and-forget back-channel logout to RPs with backchannel_logout_uri.
   * Bounded by a per-call timeout in the service so a slow RP can't delay
   * the user's redirect.
   */
  private fanOutBackchannel(userDid: string, sid: string | undefined): void {
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

  /** Validate the post-logout redirect against the allow-list; null if unsafe. */
  private async resolveLogoutRedirect(
    uri: string,
    state: string,
  ): Promise<string | null> {
    if (!uri) return null;
    try {
      const url = new URL(uri);
      if (!(await this.origins.isAllowedOrigin(url.origin))) {
        this.logger.warn('Logout redirect blocked', { uri, origin: url.origin });
        return null;
      }
      if (state) url.searchParams.set('state', state);
      return url.toString();
    } catch {
      return null;
    }
  }

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
    return await this.clientRegistry.getClientInfo(clientId);
  }

  /**
   * Create authorization code (for frontend flows)
   */
  @Post('create-code')
  @UseGuards(JwtOrSessionGuard)
  async createCode(@Req() req: Request, @Body() input: CreateCodeInput) {
    // JwtOrSessionGuard populates req.user from either the JWT principal or a
    // bare { userId } derived from the session, so we read only userId here.
    // JwtOrSessionGuard guarantees req.user carries a userId.
    const userId = (req.user as { userId: string }).userId;
    const client = await this.clientRegistry.validateClient(input.clientId);

    if (!this.clientRegistry.validateRedirectUri(client, input.redirectUri)) {
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
    const amr: string[] = req.session?.amr ?? [];
    if (!this.stepUp.isSatisfied(amr, input.acrValues)) {
      throw new UnauthorizedException({
        error: 'insufficient_user_authentication',
        error_description:
          'Requested acr_values exceeds the current session assurance level',
        acr_values: input.acrValues,
      });
    }

    const code = await this.oauthService.createAuthorizationCode({
      userId,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      scope: grantedScope,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod || 'S256',
      nonce: input.nonce,
      acrValues: this.stepUp.achievedAcr(amr) ?? input.acrValues,
      amr,
      resource: input.resource,
    });

    this.logger.oauth('Code created', { clientId: input.clientId, userId });
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
      const userId =
        typeof payload.userId === 'string' ? payload.userId : undefined;

      if (req.session) {
        req.session.userId = userId;
        this.logger.session('Set from token', { sessionId: req.session.id, userId });
      }

      if (redirect) {
        try {
          const url = new URL(redirect);
          const isAllowed = await this.origins.isAllowedOrigin(url.origin);
          if (isAllowed) return res.redirect(redirect);
        } catch { /* invalid URL, ignore redirect */ }
      }
      return res.json({ success: true, message: 'Session established' });
    } catch (error: unknown) {
      this.logger.error(
        'Token verification failed',
        error instanceof Error ? error.message : String(error),
      );
      throw new UnauthorizedException('Invalid token');
    }
  }
}
