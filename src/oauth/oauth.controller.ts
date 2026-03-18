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
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { OAuthService } from './oauth.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtOrSessionGuard } from '../auth/guards/jwt-or-session.guard';
import { LoggerService } from '../common/logger.service';
import { CreateCodeInput } from './dto/create-code.input';

@Controller('oauth')
export class OAuthController {
  private readonly logger = new LoggerService();

  constructor(
    private readonly oauthService: OAuthService,
    private readonly authService: AuthService,
  ) {
    this.logger.setContext('OAuthController');
  }

  /**
   * Authorization endpoint
   * GET /oauth/authorize
   */
  @Get('authorize')
  async authorize(
    @Query('response_type') responseType: string,
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('scope') scope: string,
    @Query('state') state: string,
    @Query('code_challenge') codeChallenge: string,
    @Query('code_challenge_method') codeChallengeMethod: string,
    @Query('prompt') prompt: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Validate required parameters
    if (!responseType || responseType !== 'code') {
      throw new BadRequestException('Invalid response_type. Only "code" is supported.');
    }

    if (!clientId) {
      throw new BadRequestException('client_id is required');
    }

    if (!redirectUri) {
      throw new BadRequestException('redirect_uri is required');
    }

    // Validate client
    const client = await this.oauthService.validateClient(clientId);

    // Validate redirect URI
    if (!this.oauthService.validateRedirectUri(client, redirectUri)) {
      throw new BadRequestException('Invalid redirect_uri');
    }

    // Validate grant type
    this.oauthService.validateGrantType(client, 'authorization_code');

    const grantedScope = this.oauthService.normalizeScope(scope || '');

    // PKCE is required
    if (!codeChallenge) {
      throw new BadRequestException('code_challenge is required (PKCE)');
    }

    // Check session
    const userId = req.session?.userId;
    this.logger.oauth('Authorize request', {
      clientId,
      hasSession: !!req.session,
      userId: userId || 'none',
      prompt,
    });

    // Silent SSO: prompt=none
    if (prompt === 'none') {
      if (!userId) {
        const errorUrl = new URL(redirectUri);
        errorUrl.searchParams.set('error', 'login_required');
        errorUrl.searchParams.set('error_description', 'User is not authenticated');
        if (state) errorUrl.searchParams.set('state', state);
        return res.redirect(errorUrl.toString());
      }

      const code = await this.oauthService.createAuthorizationCode(
        userId,
        clientId,
        redirectUri,
        grantedScope,
        codeChallenge,
        codeChallengeMethod || 'S256',
      );

      this.logger.oauth('Silent SSO success', { clientId, userId });
      const successUrl = new URL(redirectUri);
      successUrl.searchParams.set('code', code);
      if (state) successUrl.searchParams.set('state', state);
      return res.redirect(successUrl.toString());
    }

    // If user not authenticated, redirect to login
    if (!userId) {
      if (!req.session) {
        req.session = {} as any;
      }
      req.session.oauthParams = {
        clientId,
        redirectUri,
        scope,
        state,
        codeChallenge,
        codeChallengeMethod,
      };

      this.logger.oauth('Redirecting to login', { clientId });
      const loginUrl = new URL('/login', process.env.FRONTEND_URL || `https://${req.headers.host}`);
      loginUrl.searchParams.set('client_id', clientId);
      loginUrl.searchParams.set('redirect_uri', redirectUri);
      if (scope) loginUrl.searchParams.set('scope', scope);
      if (state) loginUrl.searchParams.set('state', state);
      if (codeChallenge) loginUrl.searchParams.set('code_challenge', codeChallenge);
      if (codeChallengeMethod) loginUrl.searchParams.set('code_challenge_method', codeChallengeMethod);
      
      return res.redirect(loginUrl.toString());
    }

    // User authenticated, redirect to consent
    this.logger.oauth('Redirecting to consent', { clientId, userId });
    const consentUrl = new URL('/consent', process.env.FRONTEND_URL || `https://${req.headers.host}`);
    consentUrl.searchParams.set('client_id', clientId);
    consentUrl.searchParams.set('redirect_uri', redirectUri);
    if (scope) consentUrl.searchParams.set('scope', scope);
    if (state) consentUrl.searchParams.set('state', state);
    if (codeChallenge) consentUrl.searchParams.set('code_challenge', codeChallenge);
    if (codeChallengeMethod) consentUrl.searchParams.set('code_challenge_method', codeChallengeMethod);
    
    return res.redirect(consentUrl.toString());
  }

  /**
   * Token endpoint
   * POST /oauth/token
   */
  @Post('token')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async token(
    @Body('grant_type') grantType: string,
    @Body('code') code: string,
    @Body('redirect_uri') redirectUri: string,
    @Body('client_id') clientId: string,
    @Body('client_secret') clientSecret: string,
    @Body('code_verifier') codeVerifier: string,
    @Body('refresh_token') refreshToken: string,
  ) {
    if (!grantType) {
      throw new BadRequestException('grant_type is required');
    }

    // Token endpoint requires client authentication
    const client = await this.oauthService.validateClientWithSecret(clientId, clientSecret);

    // Validate grant type
    this.oauthService.validateGrantType(client, grantType);

    if (grantType === 'authorization_code') {
      if (!code) throw new BadRequestException('code is required');
      if (!redirectUri) throw new BadRequestException('redirect_uri is required');
      if (!codeVerifier) throw new BadRequestException('code_verifier is required (PKCE)');

      const tokens = await this.oauthService.exchangeAuthorizationCode(
        code, clientId, redirectUri, codeVerifier,
      );

      this.logger.oauth('Token issued', { clientId, grantType });

      return {
        access_token: tokens.accessToken,
        token_type: 'Bearer',
        expires_in: tokens.expiresIn,
        refresh_token: tokens.refreshToken,
        id_token: tokens.idToken,
        scope: tokens.scope,
      };
    }

    if (grantType === 'refresh_token') {
      if (!refreshToken) throw new BadRequestException('refresh_token is required');

      const tokens = await this.oauthService.refreshAccessToken(refreshToken, clientId);

      this.logger.oauth('Token refreshed', { clientId });

      return {
        access_token: tokens.accessToken,
        token_type: 'Bearer',
        expires_in: tokens.expiresIn,
        refresh_token: tokens.refreshToken,
        id_token: tokens.idToken,
        scope: tokens.scope,
      };
    }

    throw new BadRequestException('Unsupported grant_type');
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
   */
  @Post('revoke')
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
   */
  @Post('introspect')
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
        token_type: 'Bearer',
      };
    } catch {
      return { active: false };
    }
  }

  /**
   * Logout endpoint
   */
  @Get('logout')
  async logout(
    @Query('post_logout_redirect_uri') postLogoutRedirectUri: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
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

    const frontendUrl = this.oauthService.getFrontendUrl();

    if (postLogoutRedirectUri) {
      try {
        const url = new URL(postLogoutRedirectUri);
        const allowedOrigins = await this.oauthService.getAllowedOrigins();
        const isAllowed = allowedOrigins.has(url.origin);
        this.logger.log('Logout redirect check', {
          postLogoutRedirectUri,
          origin: url.origin,
          isAllowed,
          allowedOrigins: [...allowedOrigins],
        });
        if (isAllowed) {
          if (state) url.searchParams.set('state', state);
          return res.redirect(url.toString());
        }
        this.logger.warn('Logout redirect blocked', {
          uri: postLogoutRedirectUri,
          origin: url.origin,
          allowedOrigins: [...allowedOrigins],
        });
      } catch (e) {
        this.logger.error('Logout redirect URI parse error: ' + postLogoutRedirectUri, e.message);
      }
    }

    return res.redirect(frontendUrl || '/');
  }

  /**
   * Create authorization code (for frontend flows)
   */
  /**
   * Get public client info (for consent page)
   */
  @Get('client-info')
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

    const code = await this.oauthService.createAuthorizationCode(
      req.user.userId,
      input.clientId,
      input.redirectUri,
      grantedScope,
      input.codeChallenge,
      input.codeChallengeMethod || 'S256',
    );

    this.logger.oauth('Code created', { clientId: input.clientId, userId: req.user.userId });
    return { code };
  }

  /**
   * Set session from JWT token (SSO helper)
   */
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
