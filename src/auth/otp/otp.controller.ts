import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import * as signature from 'cookie-signature';
import { OtpService } from './otp.service';
import { AuthService } from '../auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { LoginEmailThrottlerGuard } from '../guards/login-throttler.guard';
import { LoggerService } from '../../common/logger.service';
import { RequestOtpLoginDto } from './dto/request-otp-login.dto';
import { VerifyOtpLoginDto } from './dto/verify-otp-login.dto';
import { RequestMfaOtpDto } from './dto/request-mfa-otp.dto';
import { VerifyMfaOtpDto } from './dto/verify-mfa-otp.dto';

/**
 * Email/SMS one-time-passcode endpoints.
 *
 *   POST /v1/auth/otp/request      → email a login code (always generic)
 *   POST /v1/auth/otp/verify       → verify + establish session (login factor)
 *   POST /v1/auth/otp/mfa/request  → step-up code for the current user
 *   POST /v1/auth/otp/mfa/verify   → verify step-up, raises session amr
 */
@ApiTags('auth')
@Controller({ path: 'auth/otp', version: '1' })
export class OtpController {
  private readonly logger = new LoggerService();
  private readonly sessionSecret: string;

  constructor(
    private readonly otp: OtpService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {
    this.logger.setContext('OtpController');
    this.sessionSecret =
      this.config.get<string>('SESSION_SECRET') ||
      this.config.get<string>('JWT_SECRET') ||
      '';
  }

  @Post('request')
  @HttpCode(200)
  @UseGuards(LoginEmailThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Email a one-time login code' })
  async requestLogin(@Body() body: RequestOtpLoginDto) {
    await this.otp.requestEmailLoginCode(body.email);
    // Always-generic response: never reveal whether the email exists.
    return { sent: true };
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify a login code and start a session' })
  async verifyLogin(
    @Body() body: VerifyOtpLoginDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { user, isNewUser } = await this.otp.verifyEmailLoginCode(
      body.email,
      body.code,
    );

    await this.establishSession(req, res, { userId: user.id, amr: ['otp'] });
    const accessToken = this.authService.generateTokenForUser(user);

    res.json({
      access_token: accessToken,
      user: {
        id: user.id,
        did: user.did,
        email: user.email,
        name: user.name,
      },
      is_new_user: isNewUser,
    });
  }

  @Post('mfa/request')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Send a step-up code to the current user' })
  async requestMfa(@Body() body: RequestMfaOtpDto, @Req() req: any) {
    await this.otp.requestMfaCode(req.user.userId, body.channel, body.phone);
    return { sent: true };
  }

  @Post('mfa/verify')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify a step-up code; raises the session amr' })
  async verifyMfa(@Body() body: VerifyMfaOtpDto, @Req() req: any) {
    await this.otp.verifyMfaCode(req.user.userId, body.code);

    // Record the satisfied factor on the session so step-up enforcement can
    // see the raised assurance level (see RFC 9470 / acr handling).
    if (req.session) {
      const amr: string[] = Array.isArray(req.session.amr)
        ? req.session.amr
        : [];
      if (!amr.includes('otp')) amr.push('otp');
      req.session.amr = amr;
      await new Promise<void>((resolve) =>
        req.session.save(() => resolve()),
      );
    }
    return { verified: true };
  }

  /** Regenerate the session, bind the user + amr, set the signed cookie. */
  private async establishSession(
    req: Request,
    res: Response,
    bind: { userId: string; amr: string[] },
  ): Promise<void> {
    const session = (req as any).session;
    if (!session) return;
    await new Promise<void>((resolve, reject) => {
      session.regenerate((err: any) => {
        if (err) return reject(err);
        session.userId = bind.userId;
        session.amr = bind.amr;
        session.save((saveErr: any) => {
          if (saveErr) return reject(saveErr);
          const signed = 's:' + signature.sign(session.id, this.sessionSecret);
          res.cookie('inite.sid', signed, {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
          });
          resolve();
        });
      });
    });
  }
}
