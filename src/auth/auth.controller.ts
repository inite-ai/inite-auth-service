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
import { LoginEmailThrottlerGuard } from './guards/login-throttler.guard';
import { IpFloodGuard } from './guards/ip-flood.guard';
import { LoggerService } from '../common/logger.service';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  private readonly logger = new LoggerService();
  private readonly sessionSecret: string;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
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
}
