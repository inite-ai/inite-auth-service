import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
  Response,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Response as ExpressResponse } from 'express';
import * as signature from 'cookie-signature';
import { AuthService } from './auth.service';
import { PasskeyService } from './passkey.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginEmailThrottlerGuard } from './guards/login-throttler.guard';
import { IpFloodGuard } from './guards/ip-flood.guard';
import { LoggerService } from '../common/logger.service';
import { OAuthAuditService } from '../audit/oauth-audit.service';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  private readonly logger = new LoggerService();
  private readonly sessionSecret: string;

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly authService: AuthService,
    private readonly passkeyService: PasskeyService,
    private readonly configService: ConfigService,
    private readonly audit: OAuthAuditService,
  ) {
    this.logger.setContext('AuthController');
    this.sessionSecret = configService.get<string>('SESSION_SECRET') ||
                         configService.get<string>('JWT_SECRET') || '';
  }

  // ==================== Password Auth (Legacy) ====================

  @Post('password/register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async registerWithPassword(
    @Body() body: { email: string; password: string; name?: string },
    @Request() req: any,
  ) {
    const result = await this.authService.registerWithPassword(
      body.email,
      body.password,
      body.name,
    );
    
    // Set userId in session for SSO
    if (req.session) {
      req.session.userId = result.user.id;
      // Password registration → 'pwd' AMR for downstream id_tokens.
      req.session.amr = ['pwd'];

      await new Promise<void>((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) {
            this.logger.error('Session save error', err.message, { action: 'register' });
            reject(err);
          } else {
            this.logger.session('Saved after register', {
              sessionId: req.session.id,
              userId: req.session.userId,
            });
            resolve();
          }
        });
      });
    }
    
    return {
      access_token: result.accessToken,
      user: {
        id: result.user.id,
        did: result.user.did,
        email: result.user.email,
        name: result.user.name,
      },
    };
  }

  @Post('password/login')
  @UseGuards(LoginEmailThrottlerGuard, IpFloodGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async loginWithPassword(
    @Body() body: { email: string; password: string },
    @Request() req: any,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const result = await this.authService.loginWithPassword(
      body.email,
      body.password,
    );
    
    if (req.session) {
      const userId = result.user.id;
      
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err: any) => {
          if (err) {
            this.logger.error('Session regenerate error', err.message, { action: 'login' });
            reject(err);
            return;
          }

          req.session.userId = userId;
          // Password login → 'pwd' AMR.
          req.session.amr = ['pwd'];

          req.session.save((saveErr: any) => {
            if (saveErr) {
              this.logger.error('Session save error', saveErr.message, { action: 'login' });
              reject(saveErr);
            } else {
              this.logger.session('Regenerated and saved', {
                sessionId: req.session.id,
                userId: req.session.userId,
              });
              
              // Manually set signed session cookie
              const signedSessionId = 's:' + signature.sign(req.session.id, this.sessionSecret);
              res.cookie('inite.sid', signedSessionId, {
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/',
              });
              
              this.logger.session('Cookie set', { 
                cookiePrefix: signedSessionId.substring(0, 20) 
              });
              resolve();
            }
          });
        });
      });
    } else {
      this.logger.error('No session object available', undefined, { action: 'login' });
    }

    this.authService.notifyNewDeviceIfNeeded(result.user.id, {
      userAgent: req.get?.('user-agent') || (req as any).headers?.['user-agent'],
      ip: req.ip || (req as any).connection?.remoteAddress,
    }).catch(() => {});

    return {
      access_token: result.accessToken,
      user: {
        id: result.user.id,
        did: result.user.did,
        email: result.user.email,
        name: result.user.name,
      },
    };
  }

  // ==================== Magic Link Auth ====================

  @Post('email/send-magic-link')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async sendMagicLink(@Body() body: { 
    email: string;
    oauthParams?: {
      clientId?: string;
      redirectUri?: string;
      scope?: string;
      state?: string;
      codeChallenge?: string;
      codeChallengeMethod?: string;
    };
  }) {
    await this.authService.sendMagicLink(body.email, body.oauthParams);
    this.logger.auth('Magic link sent', { 
      email: body.email, 
      hasOAuthFlow: !!body.oauthParams?.clientId,
    });
    return {
      success: true,
      message: 'Magic link sent to your email',
    };
  }

  @Get('email/verify')
  async verifyMagicLink(
    @Query('token') token: string,
    @Request() req: any,
    @Response() res: ExpressResponse,
  ) {
    const result = await this.authService.verifyMagicLink(token);

    // Новая сессия при входе по ссылке (не возврат в старую), как при password login
    if (req.session) {
      const userId = result.user.id;
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err: any) => {
          if (err) {
            this.logger.error('Session regenerate error', err.message, { action: 'magic-link-verify' });
            reject(err);
            return;
          }
          req.session.userId = userId;
          // Magic-link uses email control as the auth factor — RFC
          // 8176 doesn't define a perfect AMR, but 'mfa' fits the
          // "knowledge + control of inbox" semantic.
          req.session.amr = ['magic-link'];
          req.session.save((saveErr: any) => {
            if (saveErr) {
              this.logger.error('Session save error', saveErr.message, { action: 'magic-link-verify' });
              reject(saveErr);
            } else {
              this.logger.session('New session after magic link verify', { sessionId: req.session.id, userId });
              const signedSessionId = 's:' + signature.sign(req.session.id, this.sessionSecret);
              res.cookie('inite.sid', signedSessionId, {
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/',
              });
              resolve();
            }
          });
        });
      });
    }

    this.authService.notifyNewDeviceIfNeeded(result.user.id, {
      userAgent: req.get?.('user-agent') || (req as any).headers?.['user-agent'],
      ip: req.ip || (req as any).connection?.remoteAddress,
    }).catch(() => {});

    return res.json({
      access_token: result.accessToken,
      user: {
        id: result.user.id,
        did: result.user.did,
        email: result.user.email,
        name: result.user.name,
      },
      is_new_user: result.isNewUser,
      oauth_params: result.oauthParams,
    });
  }

  // ==================== Password Reset ====================

  @Post('password/reset-request')
  @UseGuards(LoginEmailThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async requestPasswordReset(@Body() body: { email: string }) {
    await this.authService.requestPasswordReset(body.email);
    this.logger.auth('Password reset requested', { email: body.email });
    return {
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
    };
  }

  @Post('password/reset')
  async resetPassword(
    @Body() body: { token: string; password: string },
    @Request() req: any,
  ) {
    const result = await this.authService.resetPassword(body.token, body.password);

    if (req.session) {
      req.session.userId = result.user.id;
      req.session.amr = ['pwd'];
      this.logger.session('Set after password reset', { userId: result.user.id });
    }

    this.logger.auth('Password reset successful', { userId: result.user.id });
    
    return {
      access_token: result.accessToken,
      user: {
        id: result.user.id,
        did: result.user.did,
        email: result.user.email,
        name: result.user.name,
      },
    };
  }

  // ==================== Passkey Auth (WebAuthn) ====================

  @Post('passkey/prepare-registration')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async preparePasskeyRegistration(
    @Body() body: { email: string; name?: string },
    @Request() req: any,
  ) {
    // SECURITY: this endpoint is unauthenticated. Existing users CANNOT be
    // logged in here (would be account takeover by email enumeration) — the
    // service throws if email exists. To add a passkey to an existing
    // account, call /auth/passkey/registration/options with the user's
    // current JWT/session instead.
    const result = await this.authService.createUserForPasskey(
      body.email,
      body.name,
    );
    
    // Set userId in session for SSO
    if (req.session) {
      req.session.userId = result.user.id;
      // The user has presented an email and bootstrapped a passkey
      // registration. They have NOT yet authenticated with the
      // passkey itself (no assertion verified), so we record the
      // weaker 'magic-link'-class AMR for now. After they verify
      // their first passkey, the next session refresh upgrades AMR
      // to 'fido' on verifyAuthentication.
      req.session.amr = ['magic-link'];
      await new Promise<void>((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) {
            this.logger.error('Session save error', err.message, { action: 'passkey-prepare' });
            reject(err);
          } else {
            this.logger.session('Saved after passkey prepare', {
              sessionId: req.session.id,
              userId: req.session.userId,
            });
            resolve();
          }
        });
      });
    }
    
    this.logger.auth('Passkey registration prepared', { 
      email: body.email, 
      userId: result.user.id,
      isExistingUser: result.isExistingUser,
    });
    
    return {
      access_token: result.accessToken,
      user: {
        id: result.user.id,
        did: result.user.did,
        email: result.user.email,
        name: result.user.name,
      },
      isExistingUser: result.isExistingUser,
    };
  }

  @Post('passkey/registration/options')
  @UseGuards(JwtAuthGuard)
  async generateRegistrationOptions(@Request() req: any) {
    this.logger.auth('Passkey registration options requested', { userId: req.user.userId });
    return await this.passkeyService.generateRegistrationOptions(req.user.userId);
  }

  @Post('passkey/registration/verify')
  @UseGuards(JwtAuthGuard)
  async verifyRegistration(
    @Request() req: any,
    @Body() body: { response: any },
  ) {
    // body.challenge is intentionally ignored — the expected challenge is
    // read from server-side Redis where it was stored by the options
    // endpoint. Trusting client-supplied challenge defeats WebAuthn replay
    // protection.
    const result = await this.passkeyService.verifyRegistrationResponse(
      req.user.userId,
      body.response,
    );
    this.logger.auth('Passkey registered', { userId: req.user.userId, verified: result.verified });
    return result;
  }

  @Post('passkey/authentication/options')
  async generateAuthenticationOptions(@Body() body: { email?: string }) {
    this.logger.auth('Passkey auth options requested', { email: body.email });
    return await this.passkeyService.generateAuthenticationOptions(body.email);
  }

  @Post('passkey/authentication/verify')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verifyAuthentication(
    @Body() body: { response: any },
    @Request() req: any,
  ) {
    // body.challenge ignored — see verifyRegistration for rationale.
    const result = await this.passkeyService.verifyAuthenticationResponse(
      body.response,
    );

    const accessToken = await this.authService['generateAccessToken'](result.user);

    if (req.session) {
      req.session.userId = result.user.id;
      // FIDO2/WebAuthn assertion verified — strongest AMR class.
      req.session.amr = ['fido'];
      this.logger.session('Set after passkey auth', { userId: result.user.id });
    }

    this.authService.notifyNewDeviceIfNeeded(result.user.id, {
      userAgent: req.get?.('user-agent') || (req as any).headers?.['user-agent'],
      ip: req.ip || (req as any).connection?.remoteAddress,
    }).catch(() => {});

    this.logger.auth('Passkey authentication success', { userId: result.user.id });

    return {
      verified: result.verified,
      access_token: accessToken,
      user: {
        id: result.user.id,
        did: result.user.did,
        email: result.user.email,
        name: result.user.name,
      },
    };
  }

  @Get('passkey/list')
  @UseGuards(JwtAuthGuard)
  async listPasskeys(@Request() req: any) {
    return await this.passkeyService.getUserPasskeys(req.user.userId);
  }

  @Post('passkey/delete')
  @UseGuards(JwtAuthGuard)
  async deletePasskey(@Request() req: any, @Body() body: { passkeyId: string }) {
    await this.passkeyService.deletePasskey(req.user.userId, body.passkeyId);
    this.logger.auth('Passkey deleted', { userId: req.user.userId, passkeyId: body.passkeyId });
    return { success: true };
  }

  // ==================== Session Management ====================

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req: any) {
    const user = await this.authService.validateUser(req.user.userId);
    return {
      id: user.id,
      did: user.did,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
  }

  /**
   * Get current user from session (SSO)
   * Returns user data and access token if session is valid
   */
  @Get('session/me')
  async getSessionUser(@Request() req: any) {
    const userId = req.session?.userId;
    
    if (!userId) {
      this.logger.session('No session found for /session/me');
      return { authenticated: false };
    }

    try {
      const user = await this.authService.validateUser(userId);
      const accessToken = await this.authService.generateTokenForUser(user);
      
      this.logger.session('User retrieved from session', { userId });
      
      return {
        authenticated: true,
        access_token: accessToken,
        user: {
          id: user.id,
          did: user.did,
          email: user.email,
          emailVerified: user.emailVerified,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
      };
    } catch (error: any) {
      this.logger.error('Session user fetch failed', error.message);
      return { authenticated: false };
    }
  }

  /**
   * User-facing audit log. Returns events scoped to the authenticated
   * user — login successes/failures, password changes, OAuth grants,
   * new devices — so the user can spot suspicious activity without
   * waiting for the operator to forward an audit row.
   *
   * Matches on user.did via the audit log's `sub` column.
   */
  // eslint-disable-next-line max-params -- NestJS route handler (parameters are @Body/@Req/@Res/@Param/@Query)
  @Get('security/audit')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getSecurityAudit(
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('event') event?: string,
    @Query('success') success?: string,
    @Query('since') since?: string,
  ) {
    const did = await this.authService.getUserDid(req.user.userId);
    if (!did) {
      return { rows: [], pagination: { page: 1, limit: 50, total: 0, pages: 0 } };
    }

    return await this.audit.listForUser({
      sub: did,
      limit: limit ? Math.min(100, Math.max(1, parseInt(limit, 10) || 50)) : 50,
      page: page ? Math.max(1, parseInt(page, 10) || 1) : 1,
      event,
      success: success === undefined ? undefined : success === 'true',
      since: since ? new Date(since) : undefined,
    });
  }
}
