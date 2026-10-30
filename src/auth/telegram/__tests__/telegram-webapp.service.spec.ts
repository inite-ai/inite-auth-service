import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OAuthClientRegistryService } from '../../../oauth/oauth-client-registry.service';
import { OAuthService } from '../../../oauth/oauth.service';
import { ConsentService } from '../../../oauth/consent.service';
import { StepUpService } from '../../../oauth/step-up.service';
import { TelegramWebAppService } from '../telegram-webapp.service';
import { makeTelegram } from './telegram-harness';
import { BOT_A_TOKEN, BOT_B_TOKEN, NOW, initDataFields, signInitData } from './telegram-fixtures';

const CLIENT = {
  clientId: 'inite-shop',
  redirectUris: ['https://shop.example/callback'],
  allowedGrants: ['authorization_code', 'refresh_token'],
  allowedScopes: ['openid', 'profile'],
};

function makeWebApp(
  opts: { consentRequired?: boolean; env?: Record<string, string | undefined> } = {},
) {
  const tg = makeTelegram(opts.env);
  const registry = {
    validateClient: jest.fn(async () => CLIENT),
    validateRedirectUri: jest.fn((c: typeof CLIENT, uri: string) => c.redirectUris.includes(uri)),
    validateGrantType: jest.fn(),
  };
  const oauth = {
    normalizeScope: jest.fn((s: string) => s || 'openid'),
    createAuthorizationCode: jest.fn(async () => 'the-code'),
  };
  const consent = { isRequired: jest.fn(async () => !!opts.consentRequired) };
  const service = new TelegramWebAppService(
    tg.service,
    registry as unknown as OAuthClientRegistryService,
    oauth as unknown as OAuthService,
    consent as unknown as ConsentService,
    new StepUpService(),
  );
  return { service, oauth, consent, tg };
}

function body(initData: string, overrides: Record<string, string> = {}) {
  return {
    init_data: initData,
    client_id: 'inite-shop',
    redirect_uri: 'https://shop.example/callback',
    code_challenge: 'c'.repeat(43),
    scope: 'openid profile',
    state: 'rp-state',
    nonce: 'n-1',
    ...overrides,
  };
}

beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000));
afterEach(() => jest.restoreAllMocks());

/**
 * A Mini App's initData ends in an ordinary authorization code: the issuer's
 * createAuthorizationCode, PKCE-bound, redeemed at /v1/oauth/token like any
 * other, so the token's claims and signing are unchanged.
 */
describe('Telegram Mini App → authorization code', () => {
  it('mints a PKCE-bound code through the ordinary issuer, single-factor', async () => {
    const { service, oauth } = makeWebApp();
    const res = await service.issueCode(body(signInitData(initDataFields(), BOT_A_TOKEN)));

    expect(res).toEqual({ code: 'the-code', state: 'rp-state', is_new_user: true });
    expect(oauth.createAuthorizationCode).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        clientId: 'inite-shop',
        redirectUri: 'https://shop.example/callback',
        scope: 'openid profile',
        codeChallenge: 'c'.repeat(43),
        codeChallengeMethod: 'S256',
        nonce: 'n-1',
        amr: ['federated'],
        acrValues: 'aal1',
      }),
    );
  });

  it('refuses initData signed by a bot not bound to the client, and mints nothing', async () => {
    const { service, oauth } = makeWebApp();
    await expect(
      service.issueCode(body(signInitData(initDataFields(), BOT_B_TOKEN))),
    ).rejects.toMatchObject({ reason: 'bad_signature' });
    expect(oauth.createAuthorizationCode).not.toHaveBeenCalled();
  });

  it('refuses an unregistered redirect_uri before looking at initData', async () => {
    const { service, tg } = makeWebApp();
    await expect(
      service.issueCode(
        body(signInitData(initDataFields(), BOT_A_TOKEN), {
          redirect_uri: 'https://evil.example/',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tg.redis.setIfAbsent).not.toHaveBeenCalled();
  });

  it('answers consent_required when the client needs the consent screen', async () => {
    const { service, oauth } = makeWebApp({ consentRequired: true });
    await expect(
      service.issueCode(body(signInitData(initDataFields(), BOT_A_TOKEN))),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(oauth.createAuthorizationCode).not.toHaveBeenCalled();
  });

  it('is a 404 when the flag is off', async () => {
    const { service } = makeWebApp({ env: { TELEGRAM_PROVIDER_ENABLED: 'false' } });
    await expect(
      service.issueCode(body(signInitData(initDataFields(), BOT_A_TOKEN))),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
