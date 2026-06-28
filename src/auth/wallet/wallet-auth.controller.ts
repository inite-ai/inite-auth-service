import { Controller, Post, Body, Req, Res, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { WalletAuthService } from './wallet-auth.service';
import { AuthService } from '../auth.service';
import { establishSession } from '../session/establish-session';
import { SiweChallengeDto } from './dto/siwe-challenge.dto';
import { SiweVerifyDto } from './dto/siwe-verify.dto';

/**
 * Sign-In With Ethereum (EIP-4361) LOGIN endpoints — unauthenticated.
 *
 *   POST /v1/auth/wallet/siwe/challenge → issue a single-use sign-in nonce
 *   POST /v1/auth/wallet/siwe/verify    → verify signature + establish session
 *
 * Mirrors the email-OTP login flow: on success we establish the first-party
 * session and return an access token in the same shape.
 */
@ApiTags('auth')
@Controller({ path: 'auth/wallet', version: '1' })
export class WalletAuthController {
  private readonly sessionSecret: string;

  constructor(
    private readonly wallet: WalletAuthService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {
    this.sessionSecret =
      this.config.get<string>('SESSION_SECRET') ||
      this.config.get<string>('JWT_SECRET') ||
      '';
  }

  @Post('siwe/challenge')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Issue a SIWE sign-in challenge for an address' })
  async challenge(@Body() body: SiweChallengeDto) {
    return this.wallet.createSiweChallenge(body.address);
  }

  @Post('siwe/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify a SIWE signature and start a session' })
  async verify(
    @Body() body: SiweVerifyDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { user, isNewUser } = await this.wallet.verifySiweLogin(
      body.message,
      body.signature,
    );

    await establishSession(req, res, {
      sessionSecret: this.sessionSecret,
      userId: user.id,
      amr: ['siwe'],
    });
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
}
