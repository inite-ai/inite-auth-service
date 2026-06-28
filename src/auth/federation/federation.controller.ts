import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import * as signature from 'cookie-signature';
import { FederationService } from './federation.service';
import { FederationEmailConflictError } from './contracts/federation-email-conflict.error';
import { LoggerService } from '../../common/logger.service';

/**
 * Social login / external IdP federation endpoints.
 *
 *   GET /v1/auth/oauth/:provider/start    → 302 to the provider
 *   GET /v1/auth/oauth/:provider/callback → links/creates a user, sets the
 *                                           first-party session, 302 to the SPA
 *
 * :provider is one of the enabled connectors: google, github, oidc.
 */
@ApiTags('auth')
@Controller({ path: 'auth/oauth', version: '1' })
export class FederationController {
  private readonly logger = new LoggerService();
  private readonly sessionSecret: string;

  // OAuth-continuation params we forward through the round-trip so an
  // /authorize flow that bounced through social login can resume afterwards.
  private static readonly OAUTH_PASSTHROUGH = [
    'client_id',
    'redirect_uri',
    'scope',
    'state',
    'code_challenge',
    'code_challenge_method',
    'response_type',
    'nonce',
    'prompt',
  ];

  constructor(
    private readonly federation: FederationService,
    private readonly config: ConfigService,
  ) {
    this.logger.setContext('FederationController');
    this.sessionSecret =
      this.config.get<string>('SESSION_SECRET') ||
      this.config.get<string>('JWT_SECRET') ||
      '';
  }

  @Get('providers')
  @ApiOperation({ summary: 'List enabled social login providers' })
  listProviders() {
    return { providers: this.federation.getEnabledProviders() };
  }

  @Get(':provider/start')
  @ApiOperation({ summary: 'Begin social login — redirects to the provider' })
  async start(
    @Param('provider') provider: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const oauthParams = this.extractOAuthParams(query);
    const { url } = await this.federation.getAuthorizationUrl(provider, {
      returnTo: this.loginUrl(oauthParams),
      oauthParams,
    });
    res.redirect(url);
  }

  // eslint-disable-next-line max-params -- NestJS route handler (parameters are @Body/@Req/@Res/@Param/@Query)
  @Get(':provider/callback')
  @ApiOperation({ summary: 'Provider redirect target — links/creates the user' })
  async callback(
    @Param('provider') provider: string,
    @Query() query: { code?: string; state?: string; error?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    let result;
    try {
      result = await this.federation.handleCallback(provider, query);
    } catch (err) {
      const code =
        err instanceof FederationEmailConflictError
          ? 'email_conflict'
          : 'federation_failed';
      this.logger.error(
        'Federation callback failed',
        (err as Error)?.message ?? 'unknown',
        { provider },
      );
      res.redirect(this.loginUrl({}, code));
      return;
    }

    await this.establishSession(req, res, result.user.id);

    this.logger.auth('Federated login complete', {
      provider,
      userId: result.user.id,
      isNewUser: result.isNewUser,
    });

    res.redirect(result.returnTo);
  }

  /**
   * Regenerate the session (fresh id, no fixation), bind the user, and set the
   * signed first-party cookie — same shape as the magic-link / password flows.
   */
  private async establishSession(
    req: Request,
    res: Response,
    userId: string,
  ): Promise<void> {
    const session = (req as any).session;
    if (!session) return;
    await new Promise<void>((resolve, reject) => {
      session.regenerate((err: any) => {
        if (err) return reject(err);
        session.userId = userId;
        // RFC 8176 has no dedicated "federated" value; reflect that the
        // assertion came from an external IdP.
        session.amr = ['federated'];
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

  private extractOAuthParams(
    query: Record<string, string>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of FederationController.OAUTH_PASSTHROUGH) {
      if (query[key]) out[key] = query[key];
    }
    return out;
  }

  /** Frontend login URL, carrying any OAuth-continuation params + error code. */
  private loginUrl(
    oauthParams: Record<string, string>,
    errorCode?: string,
  ): string {
    const frontend = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const url = new URL('/login', frontend);
    for (const [k, v] of Object.entries(oauthParams)) {
      url.searchParams.set(k, v);
    }
    if (errorCode) url.searchParams.set('federation_error', errorCode);
    return url.toString();
  }
}
