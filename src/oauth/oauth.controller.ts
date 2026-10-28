import { Controller, Get, Query, Res, Req, BadRequestException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { OAuthService } from './oauth.service';
import { OAuthClientRegistryService } from './oauth-client-registry.service';
import { LoggerService } from '../common/logger.service';
import { AuthorizeQuery, ResolvedAuthorizeParams } from './dto/oauth-requests';
import { ParPayload, ParService } from './par.service';
import { RequestObjectService } from './request-object.service';
import { StepUpService } from './step-up.service';
import { ConsentService } from './consent.service';
import { rawHasWalletGrant, withWalletAcr, withWalletScopeGrant } from './wallet-grant';
import { normalizeLoginHint } from './login-hint';
import { AccountChoice, accountChoiceFor } from './account-choice';
import { buildClientRedirect } from './authorize-redirect';
import { assertResourceAllowed } from './resource-registry';

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
    private readonly consent: ConsentService,
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
  async authorize(@Query() query: AuthorizeQuery, @Req() req: Request, @Res() res: Response) {
    const p = await this.resolveAuthorizeParams(query);

    // Order matters: validate the basics, then the client, then PKCE —
    // preserving the original error precedence.
    this.assertAuthorizeBasics(p);
    const client = await this.clientRegistry.validateClient(p.clientId);
    if (!this.clientRegistry.validateRedirectUri(client, p.redirectUri)) {
      throw new BadRequestException('Invalid redirect_uri');
    }
    this.clientRegistry.validateGrantType(client, 'authorization_code');
    // RFC 8707: refuse a resource this client may not bind to before the
    // person signs in, not after (resource-registry.ts; the token endpoint
    // checks again in resolveCodeAudience).
    assertResourceAllowed(client, p.resource);
    const grantedScope = this.oauthService.normalizeScope(p.scope || '', p.clientId);
    this.assertPkce(p);

    // `wallet:pay` is the wallet grant with its default limits.
    p.authorizationDetails = withWalletScopeGrant(grantedScope, p.authorizationDetails);
    // A request for the person's wallet is approved with a passkey: ask for
    // it before the consent screen, through the ordinary step-up.
    if (rawHasWalletGrant(p.authorizationDetails)) p.acrValues = withWalletAcr(p.acrValues);

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

    // A session, but maybe the wrong account for this request, or one too
    // weak for it: back to the login screen with the question to put.
    const interruption = await this.loginInterruption(p, req, userId);
    if (interruption) {
      return this.redirectToLogin(res, req, { params: p, ...interruption });
    }

    const amr: string[] = req.session?.amr ?? [];
    // Nothing to ask: INITE's own application, or scopes the person already
    // approved. Hand the code straight back instead of showing the screen.
    const mustAsk = await this.consent.isRequired({
      userId,
      clientId: p.clientId,
      scope: grantedScope,
      authorizationDetails: p.authorizationDetails,
    });
    if (!mustAsk) {
      this.logger.oauth('Consent not needed — issuing code', { clientId: p.clientId, userId });
      return this.issueCode(res, { params: p, grantedScope, userId, amr });
    }

    this.logger.oauth('Redirecting to consent', { clientId: p.clientId, userId });
    return res.redirect(buildClientRedirect(req, '/consent', { params: p }));
  }

  /**
   * RFC 9126: when request_uri is presented, the inbound query params are
   * ignored (other than client_id, which binds the PAR consumption) and the
   * pushed values take over. Returns the normalized, camelCase params.
   */
  private async resolveAuthorizeParams(q: AuthorizeQuery): Promise<ResolvedAuthorizeParams> {
    // JAR (RFC 9101): a signed request object's claims take precedence over
    // the query. Mutually exclusive with request_uri (PAR).
    let effective = q;
    if (q.request) {
      if (q.request_uri) {
        throw new BadRequestException('request and request_uri are mutually exclusive');
      }
      const merged = await this.requestObject.resolve({
        request: q.request,
        clientId: q.client_id,
      });
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
      // OIDC ui_locales — only ever shown to the login/consent UI.
      uiLocales: q.ui_locales,
      // OIDC login_hint — dropped unless it looks like an email; prefill only.
      loginHint: normalizeLoginHint(q.login_hint),
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
      throw new BadRequestException('Only the S256 code_challenge_method is supported');
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
      return this.redirectWithError(res, p, ['login_required', 'User is not authenticated']);
    }

    // The hint names another account than the session's: OIDC core 3.1.2.6
    // has an error for exactly this, rather than answering as the wrong one.
    if (await this.accountChoice({ ...p, prompt: undefined }, userId)) {
      return this.redirectWithError(res, p, [
        'account_selection_required',
        'The signed-in account is not the one requested',
      ]);
    }

    const amr: string[] = req.session?.amr ?? [];

    // Step-up under prompt=none can't show UI, so we can't raise assurance
    // silently — return interaction_required per OIDC so the RP retries
    // interactively with the same acr_values.
    if (!this.stepUp.isSatisfied(amr, p.acrValues)) {
      return this.redirectWithError(res, p, [
        'interaction_required',
        'Requested acr_values cannot be satisfied without interaction',
      ]);
    }

    // prompt=none cannot show the consent screen. OIDC core 3.1.2.6: answer
    // consent_required rather than mint a code nobody agreed to — it used to
    // hand one to any client for anyone with a session.
    const mustAsk = await this.consent.isRequired({
      userId,
      clientId: p.clientId,
      scope: grantedScope,
      authorizationDetails: p.authorizationDetails,
    });
    if (mustAsk) {
      return this.redirectWithError(res, p, [
        'consent_required',
        'The user has not consented to this client',
      ]);
    }

    this.logger.oauth('Silent SSO success', { clientId: p.clientId, userId });
    return this.issueCode(res, { params: p, grantedScope, userId, amr });
  }

  /**
   * Why a request that has a session must still go through the login screen.
   *
   * Account first: a session that is not the account this request is for (an
   * invite sent to another address), or an RP that asked to re-authenticate
   * or pick an account, gets "who are you" rather than an answer as whoever
   * is signed in. Then step-up (RFC 9470 / OIDC acr_values): an assurance
   * level the session doesn't meet bounces back for a stronger factor; the
   * step_up hint stops the SPA from silently re-using the too-weak session.
   */
  private async loginInterruption(
    p: ResolvedAuthorizeParams,
    req: Request,
    userId: string,
  ): Promise<{ accountChoice: AccountChoice } | { stepUp: true } | null> {
    const accountChoice = await this.accountChoice(p, userId);
    if (accountChoice) {
      this.logger.oauth('Account choice required', { clientId: p.clientId, userId, accountChoice });
      return { accountChoice };
    }
    if (!this.stepUp.isSatisfied(req.session?.amr ?? [], p.acrValues)) {
      this.logger.oauth('Step-up required: session AAL below requested acr', {
        clientId: p.clientId,
        userId,
        requested: p.acrValues,
      });
      return { stepUp: true };
    }
    return null;
  }

  /** See account-choice.ts. The email lookup only happens when there is a hint. */
  private async accountChoice(
    p: ResolvedAuthorizeParams,
    userId: string,
  ): Promise<AccountChoice | null> {
    const sessionEmail = p.loginHint
      ? ((await this.oauthService.findUserById(userId))?.email ?? null)
      : null;
    return accountChoiceFor({ prompt: p.prompt, loginHint: p.loginHint, sessionEmail });
  }

  /** OIDC core 3.1.2.6: an authorization error goes back to the RP, with its state. */
  private redirectWithError(
    res: Response,
    p: ResolvedAuthorizeParams,
    [error, description]: [string, string],
  ) {
    const errorUrl = new URL(p.redirectUri);
    errorUrl.searchParams.set('error', error);
    errorUrl.searchParams.set('error_description', description);
    if (p.state) errorUrl.searchParams.set('state', p.state);
    return res.redirect(errorUrl.toString());
  }

  /** Mint a code for a request that needs no further interaction and send it back. */
  private async issueCode(
    res: Response,
    ctx: { params: ResolvedAuthorizeParams; grantedScope: string; userId: string; amr: string[] },
  ) {
    const { params: p, grantedScope, userId, amr } = ctx;
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

    const successUrl = new URL(p.redirectUri);
    successUrl.searchParams.set('code', code);
    if (p.state) successUrl.searchParams.set('state', p.state);
    return res.redirect(successUrl.toString());
  }

  private redirectToLogin(
    res: Response,
    req: Request,
    ctx: { params: ResolvedAuthorizeParams; stepUp?: boolean; accountChoice?: AccountChoice },
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
      buildClientRedirect(req, '/login', {
        params: p,
        stepUp: ctx.stepUp,
        accountChoice: ctx.accountChoice,
      }),
    );
  }
}
