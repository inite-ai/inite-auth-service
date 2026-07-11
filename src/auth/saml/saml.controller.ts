import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Res,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import * as signature from 'cookie-signature';
import { SamlEnabledGuard } from './saml-enabled.guard';
import { SamlConnectionStore } from './saml-connection.store';
import { SamlService } from './saml.service';
import { FederationService } from '../federation/federation.service';
import { LoggerService } from '../../common/logger.service';

/**
 * Public SAML 2.0 SP endpoints, gated by SAML_ENABLED.
 *
 *   GET  /v1/auth/saml/:slug/metadata → SP EntityDescriptor XML
 *   GET  /v1/auth/saml/:slug/start    → 302 to the IdP (SP-initiated AuthnRequest)
 *   POST /v1/auth/saml/:slug/acs      → consume the signed assertion, set the
 *                                       first-party session, 302 to the SPA
 *
 * The ACS is an unauthenticated cross-site POST from the IdP; its trust comes
 * entirely from the XMLDSig signature on the assertion (validated against the
 * connection's registered IdP cert), not from a session or CSRF token.
 */
@ApiTags('auth')
@UseGuards(SamlEnabledGuard)
@Controller({ path: 'auth/saml', version: '1' })
export class SamlController {
  private readonly logger = new LoggerService();
  private readonly sessionSecret: string;

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly store: SamlConnectionStore,
    private readonly saml: SamlService,
    private readonly federation: FederationService,
    private readonly config: ConfigService,
  ) {
    this.logger.setContext('SamlController');
    this.sessionSecret =
      this.config.get<string>('SESSION_SECRET') ||
      this.config.get<string>('JWT_SECRET') ||
      '';
  }

  @Get(':slug/metadata')
  @ApiOperation({ summary: 'SAML SP metadata (EntityDescriptor) for a connection' })
  async metadata(@Param('slug') slug: string, @Res() res: Response): Promise<void> {
    const connection = await this.store.findEnabledBySlug(slug);
    res.type('application/xml').send(this.saml.metadata(connection));
  }

  @Get(':slug/start')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Begin SP-initiated SAML SSO — redirects to the IdP' })
  async start(
    @Param('slug') slug: string,
    @Query('returnTo') returnTo: string,
    @Res() res: Response,
  ): Promise<void> {
    const connection = await this.store.findEnabledBySlug(slug);
    const url = await this.saml.authorizeUrl(connection, this.safeReturnTo(returnTo));
    res.redirect(url);
  }

  // eslint-disable-next-line max-params -- NestJS route handler (@Param/@Body/@Req/@Res)
  @Post(':slug/acs')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Assertion Consumer Service — consumes the signed assertion' })
  async acs(
    @Param('slug') slug: string,
    @Body() body: { SAMLResponse?: string; RelayState?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const connection = await this.store.findEnabledBySlug(slug);
    if (!body.SAMLResponse) throw new BadRequestException('SAMLResponse is required');

    let userId: string;
    try {
      const profile = await this.saml.validate(connection, body.SAMLResponse);
      const normalized = this.saml.toNormalizedProfile(connection, profile);
      const { user } = await this.federation.resolveUser(normalized);
      userId = user.id;
    } catch (err) {
      this.logger.error(
        'SAML ACS validation failed',
        (err as Error)?.message ?? 'unknown',
        { slug },
      );
      res.redirect(this.loginUrl('saml_failed'));
      return;
    }

    await this.establishSession(req, res, userId);
    this.logger.auth('SAML login complete', { slug, userId });
    res.redirect(this.safeReturnTo(body.RelayState));
  }

  /**
   * Regenerate the session (no fixation), bind the user, set the signed
   * first-party cookie — same shape as the social-federation callback.
   */
  private async establishSession(
    req: Request,
    res: Response,
    userId: string,
  ): Promise<void> {
    const session = req.session;
    if (!session) return;
    await new Promise<void>((resolve, reject) => {
      session.regenerate((err) => {
        if (err) return reject(err);
        session.userId = userId;
        session.amr = ['federated', 'saml'];
        session.save((saveErr) => {
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

  /**
   * RelayState is reflected back by the IdP and thus attacker-influenced, so a
   * post-login redirect target is only honoured when it stays within the
   * configured frontend origin — otherwise it falls back to the frontend root.
   * Stops the ACS from becoming an open redirect.
   */
  private safeReturnTo(candidate: string | undefined): string {
    const frontend = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const root = new URL('/', frontend).toString();
    if (!candidate) return root;
    try {
      const target = new URL(candidate, frontend);
      if (target.origin === new URL(frontend).origin) return target.toString();
    } catch {
      // fall through to root
    }
    return root;
  }

  private loginUrl(errorCode: string): string {
    const frontend = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const url = new URL('/login', frontend);
    url.searchParams.set('federation_error', errorCode);
    return url.toString();
  }
}
