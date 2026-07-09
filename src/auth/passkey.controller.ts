import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
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
import { PreparePasskeyRegistrationDto } from './dto/prepare-passkey-registration.dto';
import { PasskeyResponseDto } from './dto/passkey-response.dto';
import { PasskeyAuthenticationOptionsDto } from './dto/passkey-authentication-options.dto';
import { DeletePasskeyDto } from './dto/delete-passkey.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class PasskeyController {
  private readonly logger = new LoggerService();

  constructor(
    private readonly authService: AuthService,
    private readonly passkeyService: PasskeyService,
  ) {
    this.logger.setContext('PasskeyController');
  }

  // ==================== Passkey Auth (WebAuthn) ====================

  @Post('passkey/prepare-registration')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async preparePasskeyRegistration(
    @Body() body: PreparePasskeyRegistrationDto,
    @Req() req: Request,
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
  async generateAuthenticationOptions(
    @Body() body: PasskeyAuthenticationOptionsDto,
  ) {
    this.logger.auth('Passkey auth options requested', { email: body.email });
    return await this.passkeyService.generateAuthenticationOptions(body.email);
  }

  @Post('passkey/authentication/verify')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verifyAuthentication(
    @Body() body: PasskeyResponseDto,
    @Req() req: Request,
  ) {
    // body.challenge ignored — see verifyRegistration for rationale.
    const result = await this.passkeyService.verifyAuthenticationResponse(
      body.response as unknown as AuthenticationResponseJSON,
    );

    const accessToken = await this.authService['generateAccessToken'](result.user);

    if (req.session) {
      req.session.userId = result.user.id;
      // FIDO2/WebAuthn assertion verified — strongest AMR class.
      req.session.amr = ['fido'];
      this.logger.session('Set after passkey auth', { userId: result.user.id });
    }

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
