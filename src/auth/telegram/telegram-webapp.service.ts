import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { OAuthClientRegistryService } from '../../oauth/oauth-client-registry.service';
import { OAuthService } from '../../oauth/oauth.service';
import { ConsentService } from '../../oauth/consent.service';
import { StepUpService } from '../../oauth/step-up.service';
import { assertResourceAllowed } from '../../oauth/resource-registry';
import { TelegramAuthService } from './telegram-auth.service';
import { TelegramWebAppDto } from './dto/telegram-webapp.dto';

/** Telegram is a single factor, recorded the way other federated logins are. */
export const TELEGRAM_AMR = ['federated'];

/**
 * A Mini App's sign-in, as an authorization code.
 *
 * The request carries what /authorize would (client, redirect_uri, PKCE,
 * scope, resource) and is checked by the same registry calls in the same
 * order; the verified initData takes the place of the session. The code is
 * minted by OAuthService.createAuthorizationCode and redeemed at
 * /v1/oauth/token, so the token's claims, signing, audience binding and
 * refresh rotation are the issuer's ordinary ones. Nothing here mints a token.
 *
 * There is no screen inside a Mini App, so a client that would need the
 * consent screen gets `consent_required` (as /authorize answers prompt=none)
 * rather than a code nobody agreed to; INITE's own first-party clients have
 * nothing to ask. `authorization_details` is not accepted for the same reason.
 */
@Injectable()
export class TelegramWebAppService {
  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly telegram: TelegramAuthService,
    private readonly clientRegistry: OAuthClientRegistryService,
    private readonly oauthService: OAuthService,
    private readonly consent: ConsentService,
    private readonly stepUp: StepUpService,
  ) {}

  async issueCode(
    body: TelegramWebAppDto,
  ): Promise<{ code: string; state?: string; is_new_user: boolean }> {
    this.telegram.assertEnabled();
    const client = await this.clientRegistry.validateClient(body.client_id);
    if (!this.clientRegistry.validateRedirectUri(client, body.redirect_uri)) {
      throw new BadRequestException('Invalid redirect_uri');
    }
    this.clientRegistry.validateGrantType(client, 'authorization_code');
    assertResourceAllowed(client, body.resource);
    const scope = this.oauthService.normalizeScope(body.scope || '', client);

    const { user, isNewUser } = await this.telegram.verifyWebApp(body.init_data, body.client_id);

    const mustAsk = await this.consent.isRequired({
      userId: user.id,
      clientId: body.client_id,
      scope,
    });
    if (mustAsk) {
      throw new ForbiddenException({
        error: 'consent_required',
        error_description: 'This client needs the consent screen; sign in through /authorize',
      });
    }

    const code = await this.oauthService.createAuthorizationCode({
      userId: user.id,
      clientId: body.client_id,
      redirectUri: body.redirect_uri,
      scope,
      codeChallenge: body.code_challenge,
      codeChallengeMethod: 'S256',
      nonce: body.nonce,
      acrValues: this.stepUp.achievedAcr(TELEGRAM_AMR),
      amr: TELEGRAM_AMR,
      resource: body.resource,
    });
    return { code, ...(body.state ? { state: body.state } : {}), is_new_user: isNewUser };
  }
}
