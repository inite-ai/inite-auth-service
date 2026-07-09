import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoggerService } from '../common/logger.service';
import { OAuthAuditService } from '../audit/oauth-audit.service';
import { CurrentUserId } from './decorators/current-user.decorator';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthAccountController {
  private readonly logger = new LoggerService();

  constructor(
    private readonly authService: AuthService,
    private readonly audit: OAuthAuditService,
  ) {
    this.logger.setContext('AuthAccountController');
  }

  // ==================== Session Management ====================

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUserId() userId: string) {
    const user = await this.authService.validateUser(userId);
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
  async getSessionUser(@Req() req: Request) {
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
    @CurrentUserId() userId: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('event') event?: string,
    @Query('success') success?: string,
    @Query('since') since?: string,
  ) {
    const did = await this.authService.getUserDid(userId);
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
