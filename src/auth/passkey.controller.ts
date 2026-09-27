import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Res,
  HttpCode,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';
import { AuthService } from './auth.service';
import { PasskeyService } from './passkey.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoggerService } from '../common/logger.service';
import { swallow } from '../common/fire-and-forget';
import { CurrentUserId } from './decorators/current-user.decorator';
import { establishSession } from './session/establish-session';
import { PasskeyResponseDto } from './dto/passkey-response.dto';
import { PasskeyAuthenticationOptionsDto } from './dto/passkey-authentication-options.dto';
import { DeletePasskeyDto } from './dto/delete-passkey.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class PasskeyController {
  private readonly logger = new LoggerService();
  private readonly sessionSecret: string;

  constructor(
    private readonly authService: AuthService,
    private readonly passkeyService: PasskeyService,
    private readonly config: ConfigService,
  ) {
    this.logger.setContext('PasskeyController');
    this.sessionSecret =
      this.config.get<string>('SESSION_SECRET') ||
      this.config.get<string>('JWT_SECRET') ||
      '';
  }

  // ==================== Passkey Auth (WebAuthn) ====================

  // There is no unauthenticated way to create an account with a passkey.
  // POST /passkey/prepare-registration used to take any email that was not
  // yet registered, create the account with emailVerified: true, start a
  // session and hand back a token — before the email was proven and before a
  // passkey existed. Anyone could claim somebody else's address, and any RP
  // trusting email_verified would treat them as its owner. A new passkey
  // account now starts with the email one-time code (/auth/otp/request +
  // /auth/otp/verify), which proves the address and creates the account, and
  // then registers the passkey through the authenticated endpoints below.

  @Post('passkey/registration/options')
  @UseGuards(JwtAuthGuard)
  async generateRegistrationOptions(@CurrentUserId() userId: string) {
    this.logger.auth('Passkey registration options requested', { userId });
    return await this.passkeyService.generateRegistrationOptions(userId);
  }

  @Post('passkey/registration/verify')
  @UseGuards(JwtAuthGuard)
  async verifyRegistration(
    @CurrentUserId() userId: string,
    @Body() body: PasskeyResponseDto,
  ) {
    // body.challenge is intentionally ignored — the expected challenge is
    // read from server-side Redis where it was stored by the options
    // endpoint. Trusting client-supplied challenge defeats WebAuthn replay
    // protection.
    const result = await this.passkeyService.verifyRegistrationResponse(
      userId,
      body.response as unknown as RegistrationResponseJSON,
    );
    this.logger.auth('Passkey registered', { userId, verified: result.verified });
    return result;
  }

  @Post('passkey/authentication/options')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async generateAuthenticationOptions(
    // `email` is accepted for old clients and ignored: scoping the challenge
    // to it returned that address's credential ids, which told anyone asking
    // whether an email has an account with a passkey.
    @Body() _body: PasskeyAuthenticationOptionsDto,
  ) {
    return await this.passkeyService.generateAuthenticationOptions();
  }

  @Post('passkey/authentication/verify')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verifyAuthentication(
    @Body() body: PasskeyResponseDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // body.challenge ignored — see verifyRegistration for rationale.
    const result = await this.passkeyService.verifyAuthenticationResponse(
      body.response as unknown as AuthenticationResponseJSON,
    );

    const accessToken = this.authService.generateTokenForUser(result.user);

    // The same session contract as OTP, wallet and federation: regenerate
    // (no fixation), bind, set the signed cookie. Setting req.session.userId
    // in place kept whatever session id the browser arrived with.
    // `mfa` only when the authenticator verified the user (biometric or PIN):
    // a bare touch proves possession of the key, not who is holding it.
    await establishSession(req, res, {
      sessionSecret: this.sessionSecret,
      userId: result.user.id,
      amr: result.userVerified ? ['fido', 'mfa'] : ['fido'],
    });

    this.authService.notifyNewDeviceIfNeeded(result.user.id, {
      userAgent: req.get('user-agent') || req.headers['user-agent'],
      ip: req.ip || req.socket?.remoteAddress,
    }).catch(swallow(this.logger, 'new-device notification'));

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
  async listPasskeys(@CurrentUserId() userId: string) {
    return await this.passkeyService.getUserPasskeys(userId);
  }

  @Post('passkey/delete')
  @UseGuards(JwtAuthGuard)
  async deletePasskey(
    @CurrentUserId() userId: string,
    @Body() body: DeletePasskeyDto,
  ) {
    await this.passkeyService.deletePasskey(userId, body.passkeyId);
    this.logger.auth('Passkey deleted', { userId, passkeyId: body.passkeyId });
    return { success: true };
  }
}
