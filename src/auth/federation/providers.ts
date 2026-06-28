import { NormalizedProfile, TokenResponse } from './federation.types';

/**
 * Static provider metadata for the built-in connectors. The generic "oidc"
 * provider has no static endpoints — they're resolved at runtime via the
 * issuer's /.well-known/openid-configuration document.
 */
export const STATIC_PROVIDERS: Record<
  string,
  {
    displayName: string;
    scopes: string[];
    usesPkce: boolean;
    endpoints: {
      authorizationEndpoint: string;
      tokenEndpoint: string;
      userinfoEndpoint?: string;
    };
  }
> = {
  google: {
    displayName: 'Google',
    scopes: ['openid', 'email', 'profile'],
    usesPkce: true,
    endpoints: {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      userinfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    },
  },
  github: {
    displayName: 'GitHub',
    // GitHub OAuth (not OIDC) and no PKCE support. user:email lets us read the
    // primary verified email even when the user hides it on their profile.
    scopes: ['read:user', 'user:email'],
    usesPkce: false,
    endpoints: {
      authorizationEndpoint: 'https://github.com/login/oauth/authorize',
      tokenEndpoint: 'https://github.com/login/oauth/access_token',
      userinfoEndpoint: 'https://api.github.com/user',
    },
  },
};

/** Normalize Google's OIDC UserInfo response. */
export function normalizeGoogleProfile(
  data: Record<string, any>,
): NormalizedProfile {
  return {
    provider: 'google',
    subject: String(data.sub),
    email: data.email ?? null,
    // Google returns email_verified as a boolean (or "true"/"false" string).
    emailVerified: data.email_verified === true || data.email_verified === 'true',
    displayName: data.name ?? null,
    avatarUrl: data.picture ?? null,
    raw: pickClaims(data, ['sub', 'name', 'given_name', 'family_name', 'picture', 'locale']),
  };
}

/**
 * Normalize GitHub's user + emails responses. GitHub's /user has no
 * email_verified flag and may omit the email entirely, so the caller passes
 * the /user/emails payload to resolve the primary verified address.
 */
export function normalizeGithubProfile(
  user: Record<string, any>,
  emails: Array<Record<string, any>>,
): NormalizedProfile {
  const primary = emails.find((e) => e.primary && e.verified)
    ?? emails.find((e) => e.verified)
    ?? null;
  return {
    provider: 'github',
    subject: String(user.id),
    email: primary?.email ?? user.email ?? null,
    emailVerified: !!primary?.verified,
    displayName: user.name || user.login || null,
    avatarUrl: user.avatar_url ?? null,
    raw: pickClaims(user, ['id', 'login', 'name', 'avatar_url', 'html_url']),
  };
}

/** Normalize a generic OIDC UserInfo response. */
export function normalizeOidcProfile(
  data: Record<string, any>,
): NormalizedProfile {
  return {
    provider: 'oidc',
    subject: String(data.sub),
    email: data.email ?? null,
    emailVerified: data.email_verified === true || data.email_verified === 'true',
    displayName: data.name ?? data.preferred_username ?? null,
    avatarUrl: data.picture ?? null,
    raw: pickClaims(data, ['sub', 'name', 'preferred_username', 'picture', 'locale']),
  };
}

/** Keep only known, non-sensitive claims for the persisted snapshot. */
function pickClaims(
  data: Record<string, any>,
  keys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (data[k] !== undefined && data[k] !== null) out[k] = data[k];
  }
  return out;
}

/** True when a token response carries a usable access token. */
export function tokenResponseOk(t: TokenResponse): boolean {
  return !!t && !t.error && !!t.access_token;
}
