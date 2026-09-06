import {
  Controller,
  Get,
  Query,
  Res,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { OAuthService } from './oauth.service';
import { OAuthClientRegistryService } from './oauth-client-registry.service';
import { LoggerService } from '../common/logger.service';
import {
  AuthorizeQuery,
  ResolvedAuthorizeParams,
} from './dto/oauth-requests';
import { ParPayload, ParService } from './par.service';
import { RequestObjectService } from './request-object.service';
import { StepUpService } from './step-up.service';


@ApiTags('oauth')
@Controller({ path: 'oauth', version: '1' })
export class OAuthController {
  private readonly logger = new LoggerService();

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly oauthService: OAuthService,
    private readonly clientRegistry: OAuthClientRegistryService,
    private readonly par: ParService,
    private readonly stepUp: StepUpService,
    private readonly requestObject: RequestObjectService,
  ) {
    this.logger.setContext('OAuthController');
  }

  /**
   * Authorization endpoint
   * GET /oauth/authorize
   *
   * Throttled per-IP. 20/min is generous for legitimate users (a fresh
   * load + a retry handles the typical OAuth dance) but cuts off the
   * "spray client_ids to enumerate which exist" failure mode where an
   * attacker probes for valid client registrations.
   */
  @Get('authorize')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async authorize(
    @Query() query: AuthorizeQuery,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const p = await this.resolveAuthorizeParams(query);

    // Order matters: validate the basics, then the client, then PKCE —
    // preserving the original error precedence.
    this.assertAuthorizeBasics(p);
    const client = await this.clientRegistry.validateClient(p.clientId);
    if (!this.clientRegistry.validateRedirectUri(client, p.redirectUri)) {
      throw new BadRequestException('Invalid redirect_uri');
    }
    this.clientRegistry.validateGrantType(client, 'authorization_code');
    const grantedScope = this.oauthService.normalizeScope(p.scope || '');
    this.assertPkce(p);

    const userId = req.session?.userId;
    this.logger.oauth('Authorize request', {
      clientId: p.clientId,
      hasSession: !!req.session,
      userId: userId || 'none',
      prompt: p.prompt,
    });

    if (p.prompt === 'none') {
      return this.handleSilentSso(res, req, { params: p, grantedScope, userId });
    }
    if (!userId) {
      return this.redirectToLogin(res, req, { params: p });
    }

    // Step-up enforcement (RFC 9470 / OIDC acr_values). If the RP asked for an
    // assurance level the current session doesn't meet, bounce back to login
    // for a stronger factor instead of minting a code. The step_up hint stops
    // the SPA from silently re-using the existing (too-weak) session.
    const amr: string[] = req.session?.amr ?? [];
    if (!this.stepUp.isSatisfied(amr, p.acrValues)) {
      this.logger.oauth('Step-up required: session AAL below requested acr', {
        clientId: p.clientId,
        userId,
        requested: p.acrValues,
      });
      return this.redirectToLogin(res, req, { params: p, stepUp: true });
    }

    this.logger.oauth('Redirecting to consent', { clientId: p.clientId, userId });
    return res.redirect(this.buildClientRedirect(req, '/consent', { params: p }));
  }

  /**
   * RFC 9126: when request_uri is presented, the inbound query params are
   * ignored (other than client_id, which binds the PAR consumption) and the
   * pushed values take over. Returns the normalized, camelCase params.
   */
  private async resolveAuthorizeParams(
    q: AuthorizeQuery,
  ): Promise<ResolvedAuthorizeParams> {
    // JAR (RFC 9101): a signed request object's claims take precedence over
    // the query. Mutually exclusive with request_uri (PAR).
    let effective = q;
    if (q.request) {
      if (q.request_uri) {
        throw new BadRequestException('request and request_uri are mutually exclusive');
      }
      const merged = await this.requestObject.resolve({ request: q.request, clientId: q.client_id });
      effective = { ...q, ...merged };
    }
    const base = this.queryToParams(effective);
    if (!effective.request_uri) return base;
    return this.applyPushedRequest(effective.request_uri, base);
  }

  /** Map the raw query to normalized params (before any PAR override). */
  private queryToParams(q: AuthorizeQuery): ResolvedAuthorizeParams {
    return {
      responseType: q.response_type,
      clientId: q.client_id ?? '',
      redirectUri: q.redirect_uri ?? '',
      scope: q.scope,
      state: q.state,
      codeChallenge: q.code_challenge,
      codeChallengeMethod: q.code_challenge_method,
      nonce: q.nonce,
      acrValues: q.acr_values,
      prompt: q.prompt,
      // RFC 8707 Resource Indicator.
      resource: q.resource,
      // RFC 9396 — raw JSON, validated at code creation.
      authorizationDetails: q.authorization_details,
    };
  }

  /**
   * RFC 9126: consume the pushed request and let its values take over the
   * inbound query (client_id already bound the PAR consumption).
   */
  private async applyPushedRequest(
    requestUri: string,
    base: ResolvedAuthorizeParams,
  ): Promise<ResolvedAuthorizeParams> {
    if (!base.clientId) {
      throw new BadRequestException('client_id is required with request_uri');
    }
    const pushed = await this.par.consume(requestUri, base.clientId);
    if (!pushed) {
      throw new BadRequestException('Invalid or expired request_uri');
    }
    return OAuthController.mergePushed(base, pushed);
  }

  /**
   * RFC 9126 §4: pushed values take over the inbound query.
   *
   * Merged generically rather than field by field. ParPayload's keys are the
   * ResolvedAuthorizeParams keys, so a param added to the pushed request is
   * carried through on its own — this used to be a hand-written list, and
   * `resource` never made it onto that list, which is how an RFC 8707
   * indicator pushed out-of-band was dropped before it could bind the
   * audience. `undefined` entries are stripped so a param the client did not
   * push falls back to the query copy instead of blanking it.
   */
  private static mergePushed(
    base: ResolvedAuthorizeParams,
    pushed: ParPayload,
  ): ResolvedAuthorizeParams {
    const defined = Object.fromEntries(
      Object.entries(pushed).filter(([, value]) => value !== undefined),
    ) as Partial<ResolvedAuthorizeParams>;
    // redirectUri stays authoritative even if blank — par.push already 400s on
    // a missing one, so an empty value here can only mean a tampered payload.
    return { ...base, ...defined, redirectUri: pushed.redirectUri };
  }

  private assertAuthorizeBasics(p: ResolvedAuthorizeParams): void {
    if (!p.responseType || p.responseType !== 'code') {
      throw new BadRequestException('Invalid response_type. Only "code" is supported.');
    }
    if (!p.clientId) {
      throw new BadRequestException('client_id is required');
    }
    if (!p.redirectUri) {
      throw new BadRequestException('redirect_uri is required');
    }
  }

  private assertPkce(p: ResolvedAuthorizeParams): void {
    if (!p.codeChallenge) {
      throw new BadRequestException('code_challenge is required (PKCE)');
    }
    // We advertise S256-only in the OIDC discovery document, so reject the
    // weaker `plain` method instead of silently accepting it.
    if (p.codeChallengeMethod && p.codeChallengeMethod !== 'S256') {
      throw new BadRequestException(
        'Only the S256 code_challenge_method is supported',
      );
    }
  }

  private async handleSilentSso(
    res: Response,
    req: Request,
    ctx: {
      params: ResolvedAuthorizeParams;
      grantedScope: string;
      userId?: string;
    },
  ) {
    const { params: p, grantedScope, userId } = ctx;
    if (!userId) {
      const errorUrl = new URL(p.redirectUri);
      errorUrl.searchParams.set('error', 'login_required');
      errorUrl.searchParams.set('error_description', 'User is not authenticated');
      if (p.state) errorUrl.searchParams.set('state', p.state);
      return res.redirect(errorUrl.toString());
    }

    const amr: string[] = req.session?.amr ?? [];

    // Step-up under prompt=none can't show UI, so we can't raise assurance
    // silently — return interaction_required per OIDC so the RP retries
    // interactively with the same acr_values.
    if (!this.stepUp.isSatisfied(amr, p.acrValues)) {
      const errorUrl = new URL(p.redirectUri);
      errorUrl.searchParams.set('error', 'interaction_required');
      errorUrl.searchParams.set(
        'error_description',
        'Requested acr_values cannot be satisfied without interaction',
      );
      if (p.state) errorUrl.searchParams.set('state', p.state);
      return res.redirect(errorUrl.toString());
    }

    const code = await this.oauthService.createAuthorizationCode({
      userId,
      clientId: p.clientId,
      redirectUri: p.redirectUri,
      scope: grantedScope,
      codeChallenge: p.codeChallenge!,
      codeChallengeMethod: p.codeChallengeMethod || 'S256',
      nonce: p.nonce!,
      // Persist the acr actually achieved (so the id_token reflects reality),
      // falling back to the requested value when we have no amr to derive it.
      acrValues: this.stepUp.achievedAcr(amr) ?? p.acrValues ?? undefined,
      amr,
      resource: p.resource,
      authorizationDetails: p.authorizationDetails,
    });

    this.logger.oauth('Silent SSO success', { clientId: p.clientId, userId });
    const successUrl = new URL(p.redirectUri);
    successUrl.searchParams.set('code', code);
    if (p.state) successUrl.searchParams.set('state', p.state);
    return res.redirect(successUrl.toString());
  }

  private redirectToLogin(
    res: Response,
    req: Request,
    ctx: { params: ResolvedAuthorizeParams; stepUp?: boolean },
  ) {
    const p = ctx.params;
    if (!req.session) {
      req.session = {} as typeof req.session;
    }
    req.session.oauthParams = {
      clientId: p.clientId,
      redirectUri: p.redirectUri,
      scope: p.scope,
      state: p.state,
      // assertPkce() ran before we reach the login redirect, so codeChallenge
      // is present; codeChallengeMethod defaults to '' when the client omitted
      // it (the stored session copy is never read back — set at /authorize only).
      codeChallenge: p.codeChallenge ?? '',
      codeChallengeMethod: p.codeChallengeMethod ?? '',
      nonce: p.nonce,
      resource: p.resource,
      authorizationDetails: p.authorizationDetails,
    };
    this.logger.oauth('Redirecting to login', {
      clientId: p.clientId,
      stepUp: !!ctx.stepUp,
    });
    return res.redirect(
      this.buildClientRedirect(req, '/login', {
        params: p,
        stepUp: ctx.stepUp,
      }),
    );
  }

  /**
   * Every /authorize param that must survive the hop through the login or
   * consent screen, as [query key, ResolvedAuthorizeParams key].
   *
   * One list on purpose. These used to be nine inline `if` statements, and
   * `resource` (RFC 8707) was simply never added to them — so a resource
   * indicator was dropped the moment a flow showed a login screen, and the
   * issued token fell back to `aud: <client_id>`. The same omission had
   * already swallowed `authorization_details` (RFC 9396), which the consent
   * screen renders. `authorize-param-passthrough.spec.ts` fails if a new
   * ResolvedAuthorizeParams field is neither listed here nor explicitly
   * excluded, so the next param cannot go missing the same way.
   *
   * Not carried, deliberately: `responseType` (the resumed /authorize always
   * asks for `code`) and `prompt` (replaying `prompt=none` after an
   * interactive login would bounce the user straight back out).
   */
  private static readonly CARRIED_AUTHORIZE_PARAMS: ReadonlyArray<
    readonly [string, keyof ResolvedAuthorizeParams]
  > = [
    ['client_id', 'clientId'],
    ['redirect_uri', 'redirectUri'],
    ['scope', 'scope'],
    ['state', 'state'],
    ['code_challenge', 'codeChallenge'],
    ['code_challenge_method', 'codeChallengeMethod'],
    ['nonce', 'nonce'],
    // acr_values so the resumed /authorize re-checks the assurance requirement.
    ['acr_values', 'acrValues'],
    // RFC 8707 — without this the access token's audience defaults to client_id.
    ['resource', 'resource'],
    // RFC 9396 — the consent screen itemizes these before the user approves.
    ['authorization_details', 'authorizationDetails'],
  ];

  /** Build a /login or /consent redirect carrying the OAuth params forward. */
  private buildClientRedirect(
    req: Request,
    path: string,
    ctx: { params: ResolvedAuthorizeParams; stepUp?: boolean },
  ): string {
    const p = ctx.params;
    const url = new URL(path, process.env.FRONTEND_URL || `https://${req.headers.host}`);
    for (const [queryKey, paramKey] of OAuthController.CARRIED_AUTHORIZE_PARAMS) {
      const value = p[paramKey];
      if (value) url.searchParams.set(queryKey, value);
    }
    // step_up is a hint to the SPA (force a fresh, stronger factor), not an
    // inbound /authorize param — hence it sits outside the carried list.
    if (ctx.stepUp) url.searchParams.set('step_up', '1');
    return url.toString();
  }
}
