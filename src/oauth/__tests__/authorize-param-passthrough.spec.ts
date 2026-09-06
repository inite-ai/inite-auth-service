import { Request, Response } from 'express';
import { OAuthController } from '../oauth.controller';
import { OAuthService } from '../oauth.service';
import { OAuthClientRegistryService } from '../oauth-client-registry.service';
import { ParService, ParPayload } from '../par.service';
import { StepUpService } from '../step-up.service';
import { RequestObjectService } from '../request-object.service';
import { AuthorizeQuery, ResolvedAuthorizeParams } from '../dto/oauth-requests';

/**
 * The watchdog for RFC 8707 (and its neighbours) on the INTERACTIVE path.
 *
 * `resource` used to reach /authorize, get validated, and then be dropped on
 * the redirect to the login screen — so any flow that showed a login screen
 * issued a token with `aud: <client_id>` instead of the requested resource,
 * silently. `authorization_details` and `nonce` were going the same way.
 *
 * Two layers keep it from happening again:
 *   1. compile time — ALL_PARAMS is `Required<ResolvedAuthorizeParams>` and
 *      QUERY_KEY is a total `Record` over its keys, so adding a field to
 *      ResolvedAuthorizeParams breaks this file until someone decides what
 *      should happen to it;
 *   2. run time — every field that is not on NOT_CARRIED must show up in the
 *      /login and /consent redirects, and must reach createAuthorizationCode.
 */

const FRONTEND = 'https://auth.inite.test';

/** Every field of ResolvedAuthorizeParams, each with a distinctive value. */
const ALL_PARAMS: Required<ResolvedAuthorizeParams> = {
  responseType: 'code',
  clientId: 'dcr_bdaa7d5f7d4cee8086bb177ba2229e72',
  redirectUri: 'https://rp.example/callback',
  scope: 'openid profile email offline_access',
  state: 'state-9f2c',
  codeChallenge: 'challenge-abc',
  codeChallengeMethod: 'S256',
  prompt: 'consent',
  nonce: 'nonce-7e1d',
  acrValues: 'urn:inite:aal2',
  resource: 'https://inite.ai/api/mcp',
  authorizationDetails: '[{"type":"inite_mcp_resource","actions":["read"]}]',
};

/** camelCase param -> the query key it travels as. */
const QUERY_KEY: Record<keyof ResolvedAuthorizeParams, keyof AuthorizeQuery> = {
  responseType: 'response_type',
  clientId: 'client_id',
  redirectUri: 'redirect_uri',
  scope: 'scope',
  state: 'state',
  codeChallenge: 'code_challenge',
  codeChallengeMethod: 'code_challenge_method',
  prompt: 'prompt',
  nonce: 'nonce',
  acrValues: 'acr_values',
  resource: 'resource',
  authorizationDetails: 'authorization_details',
};

/**
 * Params deliberately NOT replayed into /login or /consent. Adding to this set
 * is the explicit way to opt a param out — dropping one by omission is not.
 */
const NOT_CARRIED = new Set<keyof ResolvedAuthorizeParams>([
  // The resumed /authorize always asks for `code`; the SPA sets it itself.
  'responseType',
  // Replaying `prompt=none` after an interactive login bounces the user out.
  'prompt',
]);

const PARAM_KEYS = Object.keys(ALL_PARAMS) as Array<keyof ResolvedAuthorizeParams>;
const CARRIED_KEYS = PARAM_KEYS.filter((key) => !NOT_CARRIED.has(key));

function toQuery(p: Required<ResolvedAuthorizeParams>): AuthorizeQuery {
  const query: Record<string, string> = {};
  for (const key of PARAM_KEYS) query[QUERY_KEY[key]] = p[key];
  return query as AuthorizeQuery;
}

interface Harness {
  controller: OAuthController;
  createAuthorizationCode: jest.Mock;
  parConsume: jest.Mock;
  res: { redirect: jest.Mock };
}

function harness(): Harness {
  const createAuthorizationCode = jest.fn().mockResolvedValue('auth-code-1');
  const parConsume = jest.fn().mockResolvedValue(null);

  const oauthService = {
    normalizeScope: (scope: string) => scope,
    createAuthorizationCode,
  } as unknown as OAuthService;

  const clientRegistry = {
    validateClient: jest.fn().mockResolvedValue({ clientId: ALL_PARAMS.clientId }),
    validateRedirectUri: jest.fn().mockReturnValue(true),
    validateGrantType: jest.fn(),
  } as unknown as OAuthClientRegistryService;

  const par = { consume: parConsume } as unknown as ParService;

  // Assurance always satisfied — step-up has its own suite; here we only care
  // that the params survive the hop.
  const stepUp = {
    isSatisfied: jest.fn().mockReturnValue(true),
    achievedAcr: jest.fn().mockReturnValue(undefined),
  } as unknown as StepUpService;

  const requestObject = { resolve: jest.fn() } as unknown as RequestObjectService;

  return {
    controller: new OAuthController(
      oauthService,
      clientRegistry,
      par,
      stepUp,
      requestObject,
    ),
    createAuthorizationCode,
    parConsume,
    res: { redirect: jest.fn() },
  };
}

function request(session?: Partial<Record<string, unknown>>): Request {
  return {
    headers: { host: 'auth-api.inite.test' },
    session,
  } as unknown as Request;
}

/** The URL the controller redirected the user agent to. */
function redirectedTo(res: { redirect: jest.Mock }): URL {
  expect(res.redirect).toHaveBeenCalledTimes(1);
  return new URL(res.redirect.mock.calls[0][0] as string);
}

describe('/authorize → login/consent param passthrough', () => {
  const previousFrontend = process.env.FRONTEND_URL;

  beforeAll(() => {
    process.env.FRONTEND_URL = FRONTEND;
  });

  afterAll(() => {
    if (previousFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontend;
  });

  it('carries every non-excluded param into the /consent redirect', async () => {
    const h = harness();
    await h.controller.authorize(
      toQuery(ALL_PARAMS),
      request({ userId: 'user-1', amr: ['pwd'] }),
      h.res as unknown as Response,
    );

    const url = redirectedTo(h.res);
    expect(url.pathname).toBe('/consent');
    for (const key of CARRIED_KEYS) {
      expect([key, url.searchParams.get(QUERY_KEY[key])]).toEqual([
        key,
        ALL_PARAMS[key],
      ]);
    }
  });

  it('carries every non-excluded param into the /login redirect', async () => {
    const h = harness();
    await h.controller.authorize(
      toQuery(ALL_PARAMS),
      request(undefined),
      h.res as unknown as Response,
    );

    const url = redirectedTo(h.res);
    expect(url.pathname).toBe('/login');
    for (const key of CARRIED_KEYS) {
      expect([key, url.searchParams.get(QUERY_KEY[key])]).toEqual([
        key,
        ALL_PARAMS[key],
      ]);
    }
  });

  it('does not replay response_type or prompt into the login screen', async () => {
    const h = harness();
    await h.controller.authorize(
      toQuery(ALL_PARAMS),
      request(undefined),
      h.res as unknown as Response,
    );

    const url = redirectedTo(h.res);
    for (const key of NOT_CARRIED) {
      expect(url.searchParams.has(QUERY_KEY[key])).toBe(false);
    }
  });

  it('stashes resource and authorization_details on the session copy', async () => {
    const h = harness();
    const req = request(undefined);
    await h.controller.authorize(
      toQuery(ALL_PARAMS),
      req,
      h.res as unknown as Response,
    );

    expect(req.session?.oauthParams).toMatchObject({
      clientId: ALL_PARAMS.clientId,
      nonce: ALL_PARAMS.nonce,
      resource: ALL_PARAMS.resource,
      authorizationDetails: ALL_PARAMS.authorizationDetails,
    });
  });
});

describe('/authorize → authorization code binding', () => {
  it('binds the requested resource to the code it mints', async () => {
    const h = harness();
    await h.controller.authorize(
      toQuery({ ...ALL_PARAMS, prompt: 'none' }),
      request({ userId: 'user-1', amr: ['pwd'] }),
      h.res as unknown as Response,
    );

    expect(h.createAuthorizationCode).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: ALL_PARAMS.resource,
        authorizationDetails: ALL_PARAMS.authorizationDetails,
        nonce: ALL_PARAMS.nonce,
      }),
    );
  });

  it('honours a resource pushed via PAR (RFC 9126 §4)', async () => {
    const h = harness();
    const pushed: ParPayload = {
      clientId: ALL_PARAMS.clientId,
      redirectUri: ALL_PARAMS.redirectUri,
      responseType: 'code',
      scope: ALL_PARAMS.scope,
      state: ALL_PARAMS.state,
      codeChallenge: ALL_PARAMS.codeChallenge,
      codeChallengeMethod: 'S256',
      nonce: ALL_PARAMS.nonce,
      resource: 'https://inite.ai/api/pushed',
    };
    h.parConsume.mockResolvedValue(pushed);

    await h.controller.authorize(
      {
        response_type: 'code',
        client_id: ALL_PARAMS.clientId,
        request_uri: 'urn:ietf:params:oauth:request_uri:ref',
      },
      request({ userId: 'user-1', amr: ['pwd'] }),
      h.res as unknown as Response,
    );

    expect(redirectedTo(h.res).searchParams.get('resource')).toBe(
      'https://inite.ai/api/pushed',
    );
  });
});
