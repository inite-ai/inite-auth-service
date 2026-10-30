import { Request, Response } from 'express';
import { OAuthController } from '../oauth.controller';
import { ConsentService } from '../consent.service';
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
  uiLocales: 'pt-BR es',
  loginHint: 'invitee@example.com',
  organization: 'acme-bistro',
  customer: '1',
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
  uiLocales: 'ui_locales',
  loginHint: 'login_hint',
  organization: 'organization',
  customer: 'customer',
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

/**
 * consentRequired: whether the consent service says the person must be asked.
 * sessionEmail: the session user's address — by default the hinted one, so
 * suites that are not about account choice go the usual way.
 */
function harness({
  consentRequired = true,
  sessionEmail = ALL_PARAMS.loginHint,
}: { consentRequired?: boolean; sessionEmail?: string | null } = {}): Harness {
  const createAuthorizationCode = jest.fn().mockResolvedValue('auth-code-1');
  const parConsume = jest.fn().mockResolvedValue(null);

  const oauthService = {
    normalizeScope: (scope: string) => scope,
    createAuthorizationCode,
    // Not a customer-lane client: the org hint only travels.
    customerLaneOrg: jest.fn().mockResolvedValue(null),
    customerLaneNeedsPasswordless: jest.fn().mockResolvedValue(false),
    findUserById: jest.fn().mockResolvedValue({ id: 'user-1', email: sessionEmail }),
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

  const consent = {
    isRequired: jest.fn().mockResolvedValue(consentRequired),
  } as unknown as ConsentService;

  return {
    controller: new OAuthController(
      oauthService,
      clientRegistry,
      par,
      stepUp,
      requestObject,
      consent,
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
      expect([key, url.searchParams.get(QUERY_KEY[key])]).toEqual([key, ALL_PARAMS[key]]);
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
      expect([key, url.searchParams.get(QUERY_KEY[key])]).toEqual([key, ALL_PARAMS[key]]);
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
    await h.controller.authorize(toQuery(ALL_PARAMS), req, h.res as unknown as Response);

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
    const h = harness({ consentRequired: false });
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
        organization: ALL_PARAMS.organization,
        customer: ALL_PARAMS.customer,
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

    expect(redirectedTo(h.res).searchParams.get('resource')).toBe('https://inite.ai/api/pushed');
  });
});

describe('/authorize → ui_locales', () => {
  const previousFrontend = process.env.FRONTEND_URL;
  beforeAll(() => {
    process.env.FRONTEND_URL = FRONTEND;
  });
  afterAll(() => {
    if (previousFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontend;
  });

  it('hands ui_locales to the login screen so it opens in the RP language', async () => {
    const h = harness();
    await h.controller.authorize(
      { ...toQuery(ALL_PARAMS), ui_locales: 'es' },
      request(undefined),
      h.res as unknown as Response,
    );
    const url = redirectedTo(h.res);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('ui_locales')).toBe('es');
  });

  it('honours ui_locales pushed via PAR', async () => {
    const h = harness();
    h.parConsume.mockResolvedValue({
      clientId: ALL_PARAMS.clientId,
      redirectUri: ALL_PARAMS.redirectUri,
      responseType: 'code',
      codeChallenge: ALL_PARAMS.codeChallenge,
      codeChallengeMethod: 'S256',
      uiLocales: 'pt-BR',
    } satisfies ParPayload);
    await h.controller.authorize(
      {
        response_type: 'code',
        client_id: ALL_PARAMS.clientId,
        request_uri: 'urn:ietf:params:oauth:request_uri:ref',
      },
      request(undefined),
      h.res as unknown as Response,
    );
    expect(redirectedTo(h.res).searchParams.get('ui_locales')).toBe('pt-BR');
  });
});

describe('/authorize → consent', () => {
  const previousFrontend = process.env.FRONTEND_URL;
  beforeAll(() => {
    process.env.FRONTEND_URL = FRONTEND;
  });
  afterAll(() => {
    if (previousFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontend;
  });

  it('prompt=none answers consent_required instead of minting a code nobody agreed to', async () => {
    const h = harness({ consentRequired: true });
    await h.controller.authorize(
      toQuery({ ...ALL_PARAMS, prompt: 'none' }),
      request({ userId: 'user-1', amr: ['pwd'] }),
      h.res as unknown as Response,
    );

    const url = redirectedTo(h.res);
    expect(url.searchParams.get('error')).toBe('consent_required');
    expect(url.searchParams.get('state')).toBe(ALL_PARAMS.state);
    expect(h.createAuthorizationCode).not.toHaveBeenCalled();
  });

  it('skips the consent screen when there is nothing to ask', async () => {
    const h = harness({ consentRequired: false });
    await h.controller.authorize(
      toQuery(ALL_PARAMS),
      request({ userId: 'user-1', amr: ['pwd'] }),
      h.res as unknown as Response,
    );

    const url = redirectedTo(h.res);
    expect(url.pathname).not.toBe('/consent');
    expect(url.searchParams.get('code')).toBe('auth-code-1');
    expect(url.searchParams.get('state')).toBe(ALL_PARAMS.state);
  });
});

describe('/authorize → login_hint', () => {
  const previousFrontend = process.env.FRONTEND_URL;
  beforeAll(() => {
    process.env.FRONTEND_URL = FRONTEND;
  });
  afterAll(() => {
    if (previousFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontend;
  });

  async function loginRedirectFor(loginHint: string): Promise<URL> {
    const h = harness();
    await h.controller.authorize(
      { ...toQuery(ALL_PARAMS), login_hint: loginHint },
      request(undefined),
      h.res as unknown as Response,
    );
    return redirectedTo(h.res);
  }

  it('hands an invitee email to the login screen as a prefill', async () => {
    const url = await loginRedirectFor('  invitee@example.com ');
    expect(url.searchParams.get('login_hint')).toBe('invitee@example.com');
  });

  it.each([
    ['not an email', 'not-an-email'],
    ['markup', '<script>@x.io'],
    ['over-long', `${'a'.repeat(250)}@example.com`],
  ])('drops a %s hint instead of failing the request', async (_label, hint) => {
    const url = await loginRedirectFor(hint);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.has('login_hint')).toBe(false);
  });

  it('never puts the hint on the session copy that resumes the flow', async () => {
    const h = harness();
    const req = request(undefined);
    await h.controller.authorize(toQuery(ALL_PARAMS), req, h.res as unknown as Response);
    expect(req.session?.oauthParams).not.toHaveProperty('loginHint');
  });
});

describe('/authorize → which account', () => {
  const previousFrontend = process.env.FRONTEND_URL;
  beforeAll(() => {
    process.env.FRONTEND_URL = FRONTEND;
  });
  afterAll(() => {
    if (previousFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontend;
  });

  const session = () => request({ userId: 'user-1', amr: ['pwd'] });

  it('never answers as the session when the hint names another account', async () => {
    // The invite case: signed in as A, following a link sent to B.
    const h = harness({ consentRequired: false, sessionEmail: 'someone-else@example.com' });
    await h.controller.authorize(toQuery(ALL_PARAMS), session(), h.res as unknown as Response);

    const url = redirectedTo(h.res);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('account')).toBe('select');
    expect(url.searchParams.get('login_hint')).toBe(ALL_PARAMS.loginHint);
    expect(h.createAuthorizationCode).not.toHaveBeenCalled();
  });

  it('treats a session without an email as a mismatch for any hint', async () => {
    const h = harness({ consentRequired: false, sessionEmail: null });
    await h.controller.authorize(toQuery(ALL_PARAMS), session(), h.res as unknown as Response);
    expect(redirectedTo(h.res).searchParams.get('account')).toBe('select');
    expect(h.createAuthorizationCode).not.toHaveBeenCalled();
  });

  it('matches the hint case-insensitively and then goes the usual way', async () => {
    const h = harness({ consentRequired: false, sessionEmail: 'INVITEE@Example.com' });
    await h.controller.authorize(toQuery(ALL_PARAMS), session(), h.res as unknown as Response);
    expect(redirectedTo(h.res).searchParams.get('code')).toBe('auth-code-1');
  });

  it.each([
    ['select_account', 'select'],
    ['login', 'login'],
    ['consent login', 'login'],
  ])(
    'prompt=%s asks before issuing a code even for the hinted account',
    async (prompt, expected) => {
      const h = harness({ consentRequired: false });
      await h.controller.authorize(
        toQuery({ ...ALL_PARAMS, prompt }),
        session(),
        h.res as unknown as Response,
      );
      const url = redirectedTo(h.res);
      expect(url.pathname).toBe('/login');
      expect(url.searchParams.get('account')).toBe(expected);
      expect(h.createAuthorizationCode).not.toHaveBeenCalled();
    },
  );

  it('without a hint or prompt, keeps single sign-on as it was', async () => {
    const h = harness({ consentRequired: false });
    await h.controller.authorize(
      { ...toQuery(ALL_PARAMS), login_hint: undefined, prompt: undefined },
      session(),
      h.res as unknown as Response,
    );
    expect(redirectedTo(h.res).searchParams.get('code')).toBe('auth-code-1');
  });

  it('prompt=none with a hint for another account answers account_selection_required', async () => {
    const h = harness({ consentRequired: false, sessionEmail: 'someone-else@example.com' });
    await h.controller.authorize(
      toQuery({ ...ALL_PARAMS, prompt: 'none' }),
      session(),
      h.res as unknown as Response,
    );
    const url = redirectedTo(h.res);
    expect(url.origin + url.pathname).toBe(ALL_PARAMS.redirectUri);
    expect(url.searchParams.get('error')).toBe('account_selection_required');
    expect(url.searchParams.get('state')).toBe(ALL_PARAMS.state);
    expect(h.createAuthorizationCode).not.toHaveBeenCalled();
  });
});
