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
import { sessionSecret } from '../main';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passkeyService: PasskeyService,
  ) {}

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
      
      // Explicitly save session
      await new Promise<void>((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) {
            console.error('❌ [Password Register] Session save error:', err);
            reject(err);
          } else {
            console.log('🔐 [Password Register] Session saved:', {
              sessionId: req.session.id,
              userId: req.session.userId,
            });
            resolve();
          }
        });
      });
    }
    
    // Return object directly - NestJS will handle response and session middleware will add Set-Cookie
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
    
    // Set userId in session for SSO
    if (req.session) {
      req.session.userId = result.user.id;
      
      // Regenerate session to ensure new cookie is sent
      await new Promise<void>((resolve, reject) => {
        const userId = result.user.id;
        req.session.regenerate((err: any) => {
          if (err) {
            console.error('❌ [Password Login] Session regenerate error:', err);
            reject(err);
            return;
          }
          
          // Set userId again after regeneration
          req.session.userId = userId;
          
          req.session.save((saveErr: any) => {
            if (saveErr) {
              console.error('❌ [Password Login] Session save error:', saveErr);
              reject(saveErr);
            } else {
              console.log('🔐 [Password Login] Session regenerated and saved:', {
                sessionId: req.session.id,
                userId: req.session.userId,
              });
              
              // Manually set the session cookie - express-session signs it with 's:' prefix
              const signedSessionId = 's:' + signature.sign(req.session.id, sessionSecret);
              res.cookie('inite.sid', signedSessionId, {
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/',
              });
              console.log('🍪 [Password Login] Cookie manually set:', signedSessionId.substring(0, 20) + '...');
              
              resolve();
            }
          });
        });
      });
    } else {
      console.error('❌ [Password Login] No session object available!');
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

  // ==================== Magic Link Auth ====================

  @Post('email/send-magic-link')
  async sendMagicLink(@Body() body: { email: string }) {
    await this.authService.sendMagicLink(body.email);
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

    // Set userId in session for SSO
    if (req.session) {
      req.session.userId = result.user.id;
    }

    // In production, redirect to frontend with token in URL
    // For now, return JSON
    return res.json({
      access_token: result.accessToken,
      user: {
        id: result.user.id,
        did: result.user.did,
        email: result.user.email,
        name: result.user.name,
      },
      is_new_user: result.isNewUser,
    });
  }

  // ==================== Passkey Auth (WebAuthn) ====================

  @Post('passkey/registration/options')
  @UseGuards(JwtAuthGuard)
  async generateRegistrationOptions(@Request() req: any) {
    const options = await this.passkeyService.generateRegistrationOptions(
      req.user.userId,
    );
    return options;
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
    return result;
  }

  @Post('passkey/authentication/options')
  async generateAuthenticationOptions(@Body() body: { email?: string }) {
    const options = await this.passkeyService.generateAuthenticationOptions(
      body.email,
    );
    return options;
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

    // Generate access token
    const accessToken = await this.authService['generateAccessToken'](
      result.user,
    );

    // Set userId in session for SSO
    if (req.session) {
      req.session.userId = result.user.id;
    }

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
}



