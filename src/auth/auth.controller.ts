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
import { Response as ExpressResponse } from 'express';
import * as signature from 'cookie-signature';
import { AuthService } from './auth.service';
import { PasskeyService } from './passkey.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoggerService } from '../common/logger.service';
import { sessionSecret } from '../main';

@Controller('auth')
export class AuthController {
  private readonly logger = new LoggerService();

  constructor(
    private readonly authService: AuthService,
    private readonly passkeyService: PasskeyService,
  ) {
    this.logger.setContext('AuthController');
  }

  // ==================== Password Auth (Legacy) ====================

  @Post('password/register')
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
              const signedSessionId = 's:' + signature.sign(req.session.id, sessionSecret);
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
          req.session.save((saveErr: any) => {
            if (saveErr) {
              this.logger.error('Session save error', saveErr.message, { action: 'magic-link-verify' });
              reject(saveErr);
            } else {
              this.logger.session('New session after magic link verify', { sessionId: req.session.id, userId });
              const signedSessionId = 's:' + signature.sign(req.session.id, sessionSecret);
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
  async preparePasskeyRegistration(
    @Body() body: { email: string; name?: string; allowExisting?: boolean },
    @Request() req: any,
  ) {
    // allowExisting defaults to false for registration flow (will throw error if user exists)
    const result = await this.authService.createUserForPasskey(
      body.email,
      body.name,
      body.allowExisting ?? false,
    );
    
    // Set userId in session for SSO
    if (req.session) {
      req.session.userId = result.user.id;
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
    @Body() body: { response: any; challenge: string },
  ) {
    const result = await this.passkeyService.verifyRegistrationResponse(
      req.user.userId,
      body.response,
      body.challenge,
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
  async verifyAuthentication(
    @Body() body: { response: any; challenge: string },
    @Request() req: any,
  ) {
    const result = await this.passkeyService.verifyAuthenticationResponse(
      body.response,
      body.challenge,
    );

    const accessToken = await this.authService['generateAccessToken'](result.user);

    if (req.session) {
      req.session.userId = result.user.id;
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
}
