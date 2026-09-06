/**
 * OAuth flow helpers
 * Centralized OAuth redirect and code generation logic
 */

export interface OAuthParams {
  clientId?: string | null
  redirectUri?: string | null
  scope?: string | null
  state?: string | null
  codeChallenge?: string | null
  codeChallengeMethod?: string | null
  /** OIDC nonce — replayed into the id_token, so it has to survive the hop. */
  nonce?: string | null
  /** Requested authentication assurance (OIDC acr_values / step-up). */
  acrValues?: string | null
  /** RFC 8707 resource indicator — binds the issued access-token audience. */
  resource?: string | null
  /** RFC 9396 raw `authorization_details` JSON (validated server-side). */
  authorizationDetails?: string | null
}

/**
 * Check if we're in an OAuth flow
 */
export function isOAuthFlow(params: OAuthParams): boolean {
  return !!(params.clientId && params.redirectUri)
}

/** Scope assumed when a resumed /authorize has none stashed alongside it. */
const DEFAULT_SCOPE = 'openid profile email offline_access'

/**
 * The one list of params that must survive every client-side hop of the flow
 * (/oauth/authorize -> /login -> /consent -> create-code), as
 * [query key, OAuthParams key].
 *
 * Every builder below reads this list rather than spelling the params out, so
 * a param can no longer be carried by two hops and dropped by the third —
 * which is precisely how `resource` (RFC 8707) came to be honoured only in
 * flows that never showed a login screen.
 */
const PASSTHROUGH: ReadonlyArray<readonly [string, keyof OAuthParams]> = [
  ['client_id', 'clientId'],
  ['redirect_uri', 'redirectUri'],
  ['scope', 'scope'],
  ['state', 'state'],
  ['code_challenge', 'codeChallenge'],
  ['code_challenge_method', 'codeChallengeMethod'],
  ['nonce', 'nonce'],
  ['acr_values', 'acrValues'],
  ['resource', 'resource'],
  ['authorization_details', 'authorizationDetails'],
]

function applyPassthrough(url: URL, params: OAuthParams): void {
  for (const [queryKey, paramKey] of PASSTHROUGH) {
    const value = params[paramKey]
    if (value) url.searchParams.set(queryKey, value)
  }
}

/**
 * Build consent page URL with all OAuth params
 */
export function buildConsentUrl(params: OAuthParams): string {
  const url = new URL('/consent', window.location.origin)
  applyPassthrough(url, params)
  return url.pathname + url.search
}

/**
 * Build login page URL with OAuth params preserved
 */
export function buildLoginUrl(params: OAuthParams): string {
  const url = new URL('/login', window.location.origin)
  applyPassthrough(url, params)
  return url.pathname + url.search
}

/**
 * Rebuild the /oauth/authorize request after an out-of-band login (magic
 * link, federated callback) has already established the session.
 *
 * Absolute URL: callers hand it straight to window.location.
 */
export function buildAuthorizeUrl(params: OAuthParams): string {
  const url = new URL('/oauth/authorize', window.location.origin)
  url.searchParams.set('response_type', 'code')
  applyPassthrough(url, {
    ...params,
    scope: params.scope || DEFAULT_SCOPE,
    codeChallengeMethod: params.codeChallengeMethod || 'S256',
  })
  return url.toString()
}

/**
 * Build redirect URL with authorization code
 */
export function buildRedirectWithCode(redirectUri: string, code: string, state?: string | null): string {
  const url = new URL(redirectUri)
  url.searchParams.set('code', code)
  if (state) url.searchParams.set('state', state)
  return url.toString()
}

/**
 * Create authorization code via API
 */
export async function createAuthorizationCode(
  accessToken: string,
  params: OAuthParams
): Promise<string> {
  const response = await fetch('/v1/oauth/create-code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    credentials: 'include',
    body: JSON.stringify({
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      state: params.state,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      nonce: params.nonce,
      acrValues: params.acrValues,
      resource: params.resource,
      authorizationDetails: params.authorizationDetails ?? undefined,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to create authorization code')
  }

  const data = await response.json()
  return data.code
}

/**
 * Extract OAuth params from URL search params
 */
export function extractOAuthParams(searchParams: URLSearchParams): OAuthParams {
  return {
    clientId: searchParams.get('client_id'),
    redirectUri: searchParams.get('redirect_uri'),
    scope: searchParams.get('scope'),
    state: searchParams.get('state'),
    codeChallenge: searchParams.get('code_challenge'),
    codeChallengeMethod: searchParams.get('code_challenge_method'),
    nonce: searchParams.get('nonce'),
    acrValues: searchParams.get('acr_values'),
    resource: searchParams.get('resource'),
    authorizationDetails: searchParams.get('authorization_details'),
  }
}

/** One parsed RFC 9396 entry, plus the whole-list parse helper. */
export interface ParsedAuthorizationDetail {
  type: string
  locations?: string[]
  actions?: string[]
  [key: string]: unknown
}

/**
 * Best-effort parse of the raw `authorization_details` JSON for display.
 * Returns null on malformed input — the consent page then shows a warning
 * and does NOT forward the parameter (the backend would reject it anyway).
 */
export function parseAuthorizationDetails(
  raw: string | null | undefined,
): ParsedAuthorizationDetail[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) return null
      if (typeof (entry as { type?: unknown }).type !== 'string') return null
    }
    return parsed as ParsedAuthorizationDetail[]
  } catch {
    return null
  }
}



