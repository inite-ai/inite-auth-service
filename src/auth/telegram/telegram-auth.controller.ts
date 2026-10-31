import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { LoggerService } from '../../common/logger.service';
import { establishSession } from '../session/establish-session';
import { extractOAuthParams } from '../federation/contracts/oauth-passthrough';
import { TelegramAuthService } from './telegram-auth.service';
import { TelegramWebAppService, TELEGRAM_AMR } from './telegram-webapp.service';
import { TelegramAuthError } from './contracts/telegram-auth.error';
import { TelegramWebAppDto } from './dto/telegram-webapp.dto';

const STATE_COOKIE = 'inite.tg_state';
const STATE_COOKIE_PATH = '/v1/auth/telegram';

/**
 * Telegram sign-in. Off unless TELEGRAM_PROVIDER_ENABLED (404 otherwise).
 *
 *   GET  /v1/auth/telegram/start?bot=<name>&<authorize params>
 *        → { bot_username, bot_id, auth_url }; sets the one-use state cookie.
 *          The login page renders the Login Widget with
 *          data-telegram-login=bot_username and data-auth-url=auth_url.
 *   GET  /v1/auth/telegram/callback?tg_state=…&<Telegram's fields>
 *        → the widget's redirect: verify, link/create the user, set the
 *          first-party session, 302 to /login with the authorize params,
 *          which resumes /authorize → code → token like a Google sign-in.
 *   POST /v1/auth/telegram/webapp { init_data, client_id, redirect_uri, code_challenge, … }
 *        → { code, state? } for a Mini App; redeemed at /v1/oauth/token.
 */
@ApiTags('auth')
@Controller({ path: 'auth/telegram', version: '1' })
export class TelegramAuthController {
  private readonly logger = new LoggerService();
  private readonly sessionSecret: string;

  constructor(
    private readonly telegram: TelegramAuthService,
    private readonly webApp: TelegramWebAppService,
    private readonly config: ConfigService,
  ) {
    this.logger.setContext('TelegramAuthController');
    this.sessionSecret =
      this.config.get<string>('SESSION_SECRET') || this.config.get<string>('JWT_SECRET') || '';
  }

  @Get('start')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Begin a Telegram Login Widget sign-in for an /authorize in flight' })
  async start(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ bot_username: string; bot_id: string; auth_url: string }> {
    const botName = typeof query.bot === 'string' ? query.bot : '';
    try {
      const { state, bot } = await this.telegram.startWidget(botName, extractOAuthParams(query));
      res.cookie(STATE_COOKIE, state, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 10 * 60 * 1000,
        path: STATE_COOKIE_PATH,
      });
      const authUrl = new URL(`${STATE_COOKIE_PATH}/callback`, this.issuer());
      authUrl.searchParams.set('tg_state', state);
      return { bot_username: bot.username, bot_id: bot.botId, auth_url: authUrl.toString() };
    } catch (err) {
      throw this.httpError(err);
    }
  }

  @Get('callback')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Login Widget redirect target: links/creates the user' })
  async callback(
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const browserState = (req.cookies as Record<string, string> | undefined)?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: STATE_COOKIE_PATH });
    let result;
    try {
      result = await this.telegram.completeWidget(query, browserState);
    } catch (err) {
      if (!(err instanceof TelegramAuthError)) throw err;
      this.logger.warn('Telegram widget sign-in refused', { reason: err.reason });
      res.redirect(this.loginUrl({}, 'telegram_failed'));
      return;
    }
    await establishSession(req, res, {
      sessionSecret: this.sessionSecret,
      userId: result.user.id,
      amr: TELEGRAM_AMR,
    });
    res.redirect(this.loginUrl(result.oauthParams));
  }

  @Post('webapp')
  @HttpCode(200)
  // A Mini App signs in once per open; 30/min per IP covers a shared NAT.
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Exchange Mini App initData for an authorization code' })
  async webapp(@Body() body: TelegramWebAppDto) {
    try {
      return await this.webApp.issueCode(body);
    } catch (err) {
      throw this.httpError(err);
    }
  }

  /** A refusal as an OAuth-shaped error; the reason is a fixed code, never the payload. */
  private httpError(err: unknown): unknown {
    if (!(err instanceof TelegramAuthError)) return err;
    this.logger.warn('Telegram sign-in refused', { reason: err.reason });
    if (err.reason === 'unknown_bot' || err.reason === 'bot_not_bound') {
      return new BadRequestException({ error: 'invalid_request', error_description: err.reason });
    }
    return new UnauthorizedException({ error: 'access_denied', error_description: err.reason });
  }

  /** The public base the federation callbacks use (FederationProviders.redirectUri). */
  private issuer(): string {
    return (
      this.config.get<string>('FEDERATION_REDIRECT_BASE') ??
      this.config.get<string>('OIDC_ISSUER') ??
      'http://localhost:3002'
    );
  }

  /** Frontend /login carrying the authorize params, as the federation callback does. */
  private loginUrl(oauthParams: Record<string, string>, errorCode?: string): string {
    const frontend = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const url = new URL('/login', frontend);
    for (const [k, v] of Object.entries(oauthParams)) url.searchParams.set(k, v);
    if (errorCode) url.searchParams.set('federation_error', errorCode);
    return url.toString();
  }
}
