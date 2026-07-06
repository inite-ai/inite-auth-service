import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { PasskeyService } from './passkey.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoggerService } from '../common/logger.service';

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
}
