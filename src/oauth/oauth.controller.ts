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
import { Response, Request } from 'express';
import { OAuthService } from './oauth.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtOrSessionGuard } from '../auth/guards/jwt-or-session.guard';
import { CreateCodeInput } from './dto/create-code.input';

@Controller('oauth')
export class OAuthController {
  constructor(
    private readonly oauthService: OAuthService,
    private readonly authService: AuthService,
  ) {}

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

    // PKCE is required
    if (!codeChallenge) {
      throw new BadRequestException('code_challenge is required (PKCE)');
    }

    // Check if user is already authenticated (session check)
    console.log('🔐 [OAuth Authorize] Session check:', {
      hasSession: !!req.session,
      sessionId: req.session?.id,
      userId: req.session?.userId,
      cookies: req.headers.cookie,
    });
    
    const userId = req.session?.userId;

    // Silent SSO: prompt=none
    if (prompt === 'none') {
      if (!userId) {
        // User not authenticated, return error to redirect_uri
        const errorUrl = new URL(redirectUri);
        errorUrl.searchParams.set('error', 'login_required');
        errorUrl.searchParams.set('error_description', 'User is not authenticated');
        if (state) errorUrl.searchParams.set('state', state);
        return res.redirect(errorUrl.toString());
      }

      // User authenticated, generate code and redirect immediately
      const code = await this.oauthService.createAuthorizationCode(
        userId,
        clientId,
        redirectUri,
        scope || 'openid profile email',
        codeChallenge,
        codeChallengeMethod || 'S256',
      );

      const successUrl = new URL(redirectUri);
      successUrl.searchParams.set('code', code);
      if (state) successUrl.searchParams.set('state', state);
      return res.redirect(successUrl.toString());
    }

    // If user not authenticated, redirect to login page
    if (!userId) {
      // Store OAuth params in session for after login
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

      // Redirect to frontend login page
      const loginUrl = new URL('/login', process.env.FRONTEND_URL || `https://${req.headers.host}`);
      loginUrl.searchParams.set('client_id', clientId);
      loginUrl.searchParams.set('redirect_uri', redirectUri);
      if (scope) loginUrl.searchParams.set('scope', scope);
      if (state) loginUrl.searchParams.set('state', state);
      if (codeChallenge) loginUrl.searchParams.set('code_challenge', codeChallenge);
      if (codeChallengeMethod) loginUrl.searchParams.set('code_challenge_method', codeChallengeMethod);
      
      return res.redirect(loginUrl.toString());
    }

    // User is authenticated, redirect to consent screen
    const consentUrl = new URL('/oauth/consent', process.env.FRONTEND_URL || `https://${req.headers.host}`);
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

    // Validate client
    await this.oauthService.validateClient(clientId, clientSecret);

    if (grantType === 'authorization_code') {
      if (!code) {
        throw new BadRequestException('code is required');
      }

      if (!redirectUri) {
        throw new BadRequestException('redirect_uri is required');
      }

      if (!codeVerifier) {
        throw new BadRequestException('code_verifier is required (PKCE)');
      }

      const tokens = await this.oauthService.exchangeAuthorizationCode(
        code,
        clientId,
        redirectUri,
        codeVerifier,
      );

      return {
        access_token: tokens.accessToken,
        token_type: 'Bearer',
        expires_in: tokens.expiresIn,
        refresh_token: tokens.refreshToken,
        id_token: tokens.idToken,
        scope: 'openid profile email',
      };
    }

    if (grantType === 'refresh_token') {
      if (!refreshToken) {
        throw new BadRequestException('refresh_token is required');
      }

      const tokens = await this.oauthService.refreshAccessToken(
        refreshToken,
        clientId,
      );

      return {
        access_token: tokens.accessToken,
        token_type: 'Bearer',
        expires_in: tokens.expiresIn,
        refresh_token: tokens.refreshToken,
        id_token: tokens.idToken,
        scope: 'openid profile email',
      };
    }

    throw new BadRequestException('Unsupported grant_type');
  }

  /**
   * User info endpoint (OIDC)
   * GET /oauth/userinfo
   */
  @Get('userinfo')
  @UseGuards(JwtAuthGuard)
  async userinfo(@Req() req: any) {
    return await this.oauthService.getUserInfo(req.user.userId);
  }

  /**
   * Token revocation endpoint
   * POST /oauth/revoke
   */
  @Post('revoke')
  async revoke(
    @Body('token') token: string,
    @Body('client_id') clientId: string,
    @Body('client_secret') clientSecret: string,
  ) {
    if (!token) {
      throw new BadRequestException('token is required');
    }

    // Validate client
    await this.oauthService.validateClient(clientId, clientSecret);

    await this.oauthService.revokeToken(token, clientId);

    return { success: true };
  }

  /**
   * Logout endpoint
   * GET /oauth/logout
   */
  @Get('logout')
  async logout(
    @Query('post_logout_redirect_uri') postLogoutRedirectUri: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Clear session using destroy method
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destroy error:', err);
        }
      });
    }

    // Redirect to post_logout_redirect_uri if provided
    if (postLogoutRedirectUri) {
      const url = new URL(postLogoutRedirectUri);
      if (state) url.searchParams.set('state', state);
      return res.redirect(url.toString());
    }

    return res.json({ success: true, message: 'Logged out successfully' });
  }

  /**
   * Create authorization code (for API registration flows)
   * POST /oauth/create-code
   * Accepts JWT token OR session userId
   */
  @Post('create-code')
  @UseGuards(JwtOrSessionGuard)
  async createCode(@Req() req: any, @Body() input: CreateCodeInput) {
    // Validate client
    const client = await this.oauthService.validateClient(input.clientId);

    // Validate redirect URI
    if (!this.oauthService.validateRedirectUri(client, input.redirectUri)) {
      throw new BadRequestException('Invalid redirect_uri');
    }

    // PKCE is required
    if (!input.codeChallenge) {
      throw new BadRequestException('code_challenge is required (PKCE)');
    }

    // Create authorization code for authenticated user
    const code = await this.oauthService.createAuthorizationCode(
      req.user.userId,
      input.clientId,
      input.redirectUri,
      input.scope || 'openid profile email',
      input.codeChallenge,
      input.codeChallengeMethod || 'S256',
    );

    return { code };
  }

  /**
   * Set session from JWT token (for SSO after frontend login)
   * GET /oauth/session?token=...&redirect=...
   */
  @Get('session')
  async setSession(
    @Query('token') token: string,
    @Query('redirect') redirect: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new BadRequestException('token is required');
    }

    try {
      // Verify and decode the token
      const payload = await this.authService.verifyToken(token);
      
      // Set userId in session
      if (req.session) {
        req.session.userId = payload.userId;
        console.log('🔐 [Session Set] userId set in session:', {
          sessionId: req.session.id,
          userId: payload.userId,
        });
      }

      // Redirect to the original OAuth flow or provided redirect
      if (redirect) {
        return res.redirect(redirect);
      }

      return res.json({ success: true, message: 'Session established' });
    } catch (error) {
      console.error('❌ [Session Set] Token verification failed:', error);
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * JWKS endpoint (JSON Web Key Set)
   * GET /.well-known/jwks.json
   */
  @Get('../.well-known/jwks.json')
  async jwks() {
    // In production, this should return the public keys used to sign JWTs
    // For now, we'll return an empty set
    return {
      keys: [],
    };
  }
}

