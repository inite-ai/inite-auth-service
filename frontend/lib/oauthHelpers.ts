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

/**
 * Build consent page URL with all OAuth params
 */
export function buildConsentUrl(params: OAuthParams): string {
  const url = new URL('/consent', window.location.origin)
  
  if (params.clientId) url.searchParams.set('client_id', params.clientId)
  if (params.redirectUri) url.searchParams.set('redirect_uri', params.redirectUri)
  if (params.scope) url.searchParams.set('scope', params.scope)
  if (params.state) url.searchParams.set('state', params.state)
  if (params.codeChallenge) url.searchParams.set('code_challenge', params.codeChallenge)
  if (params.codeChallengeMethod) url.searchParams.set('code_challenge_method', params.codeChallengeMethod)
  if (params.acrValues) url.searchParams.set('acr_values', params.acrValues)
  if (params.resource) url.searchParams.set('resource', params.resource)
  if (params.authorizationDetails)
    url.searchParams.set('authorization_details', params.authorizationDetails)

  return url.pathname + url.search
}

/**
 * Build login page URL with OAuth params preserved
 */
export function buildLoginUrl(params: OAuthParams): string {
  const url = new URL('/login', window.location.origin)
  
  if (params.clientId) url.searchParams.set('client_id', params.clientId)
  if (params.redirectUri) url.searchParams.set('redirect_uri', params.redirectUri)
  if (params.scope) url.searchParams.set('scope', params.scope)
  if (params.state) url.searchParams.set('state', params.state)
  if (params.codeChallenge) url.searchParams.set('code_challenge', params.codeChallenge)
  if (params.codeChallengeMethod) url.searchParams.set('code_challenge_method', params.codeChallengeMethod)
  if (params.acrValues) url.searchParams.set('acr_values', params.acrValues)
  if (params.resource) url.searchParams.set('resource', params.resource)
  if (params.authorizationDetails)
    url.searchParams.set('authorization_details', params.authorizationDetails)

  return url.pathname + url.search
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



