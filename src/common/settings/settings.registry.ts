/**
 * The registry of operator-tunable runtime settings. This is the single source
 * of truth for which env keys may be overridden from the admin UI, how each is
 * typed/validated, and how it's grouped/labelled for display. A key NOT in this
 * list can never be written through the settings API (secrets like JWT/SMTP keys
 * are intentionally absent — they stay env-only).
 */

export type SettingType = 'flag' | 'duration' | 'csv' | 'text';

export interface SettingDef {
  key: string;
  type: SettingType;
  group: string;
  label: string;
  description: string;
  /** Fallback used when neither a DB override nor an env value is present. */
  default?: string;
  /** Large/sensitive value — the API returns whether it's set, not the value. */
  secret?: boolean;
}

export const SETTINGS_REGISTRY: readonly SettingDef[] = [
  // --- Security features (RFC gates) ---
  {
    key: 'RAR_ENABLED',
    type: 'flag',
    group: 'Security features',
    label: 'Rich Authorization Requests',
    description: 'RFC 9396 — accept typed `authorization_details` at /authorize + /par.',
  },
  {
    key: 'TON_WALLET_LINKING_ENABLED',
    type: 'flag',
    group: 'Security features',
    label: 'TON wallet linking',
    description:
      'Accept TON Connect ton_proof at /wallet/ton/link. Off until the proof has been exercised against live wallets across TON wallet versions.',
  },
  {
    key: 'MTLS_ENABLED',
    type: 'flag',
    group: 'Security features',
    label: 'mTLS + certificate-bound tokens',
    description: 'RFC 8705 — mutual-TLS client auth and cnf["x5t#S256"] token binding.',
  },
  {
    key: 'SCIM_ENABLED',
    type: 'flag',
    group: 'Security features',
    label: 'SCIM 2.0 provisioning',
    description: 'RFC 7643/7644 — inbound user/group sync at /scim/v2.',
  },
  {
    key: 'SAML_ENABLED',
    type: 'flag',
    group: 'Security features',
    label: 'SAML 2.0 SSO',
    description: 'Inbound enterprise SSO at /v1/auth/saml (Service Provider).',
  },
  {
    key: 'TELEGRAM_PROVIDER_ENABLED',
    type: 'flag',
    group: 'Security features',
    label: 'Telegram sign-in',
    description:
      'Accept Telegram Login Widget and Mini App initData sign-ins at /v1/auth/telegram, ' +
      'verified with the bots in TELEGRAM_BOTS (tokens env-only). Off = the surface 404s.',
  },
  {
    key: 'TELEGRAM_AUTH_MAX_AGE',
    type: 'duration',
    group: 'Security features',
    label: 'Telegram payload max age',
    description: 'Oldest auth_date a Telegram widget payload or initData is accepted with (e.g. 1h, 1d).',
    default: '1d',
  },
  // --- Tokens ---
  {
    key: 'RBAC_TOKEN_CLAIMS_ENABLED',
    type: 'flag',
    group: 'Tokens',
    label: 'RBAC token claims',
    description: 'Embed organization + role claims in issued access tokens.',
  },
  {
    key: 'PERSONAL_WORKSPACE_PROVISIONING_ENABLED',
    type: 'flag',
    group: 'Tokens',
    label: 'Personal workspace on first use',
    description:
      'Give a user with no organisation one (owner membership) the first time ' +
      "they request a provisioning vertical's scopes — so an OAuth flow from " +
      'an MCP client ends in a usable tenant instead of a token with no org claim. ' +
      'Off = unchanged behaviour: no membership, no org.',
  },
  {
    key: 'DEMO_GRANT_ENABLED',
    type: 'flag',
    group: 'Tokens',
    label: 'Demo sign-in grant',
    description:
      'Let a first-party confidential client exchange `demo:<persona>` ' +
      '(RFC 8693, subject_token_type urn:inite:params:oauth:token-type:demo-persona) ' +
      'for a read-only 2 h token of that persona in the «Atlântica Group (demo)» org. ' +
      'No refresh token. Off = every demo request is refused with invalid_grant.',
  },
  {
    key: 'JWT_ACCESS_TOKEN_EXPIRY',
    type: 'duration',
    group: 'Tokens',
    label: 'User access-token TTL',
    description: 'Lifetime of user-flow access tokens (e.g. 10m, 1h).',
    default: '10m',
  },
  {
    key: 'JWT_M2M_ACCESS_TOKEN_EXPIRY',
    type: 'duration',
    group: 'Tokens',
    label: 'M2M access-token TTL',
    description: 'Lifetime of client_credentials / exchange tokens (e.g. 5m).',
    default: '5m',
  },
  // --- RAR ---
  {
    key: 'AUTHORIZATION_DETAILS_TYPES',
    type: 'csv',
    group: 'Rich Authorization Requests',
    label: 'Accepted authorization_details types',
    description: 'Comma-separated allow-list advertised in discovery + enforced.',
    default: 'inite_mcp_resource,payment_initiation,inite_wallet',
  },
  // --- mTLS ---
  {
    key: 'MTLS_CLIENT_CERT_HEADER',
    type: 'text',
    group: 'mTLS',
    label: 'Forwarded client-cert header',
    description: 'Proxy header carrying the client certificate.',
    default: 'x-forwarded-tls-client-cert',
  },
  {
    key: 'MTLS_ISSUER',
    type: 'text',
    group: 'mTLS',
    label: 'mTLS host (endpoint aliases)',
    description: 'Separate mTLS host advertised as mtls_endpoint_aliases.',
  },
  {
    key: 'MTLS_TRUSTED_CA_CERT',
    type: 'text',
    group: 'mTLS',
    label: 'Trusted client CA (PEM)',
    description: 'PEM CA that tls_client_auth (PKI) client certs must chain to.',
    secret: true,
  },
  {
    key: 'MTLS_REVOKED_CERTS',
    type: 'csv',
    group: 'mTLS',
    label: 'Revoked client certificates',
    description:
      'Deny-list checked on every mTLS client authentication (the edge has no CRL): ' +
      'x5t#S256 thumbprints, hex SHA-256 fingerprints or hex serial numbers.',
  },
] as const;

const BY_KEY = new Map(SETTINGS_REGISTRY.map((s) => [s.key, s]));

/** The registry entry for a key, or undefined if the key isn't operator-tunable. */
export function settingDef(key: string): SettingDef | undefined {
  return BY_KEY.get(key);
}

/** Validate a raw string value against a setting's type. Returns an error or null. */
export function validateSettingValue(def: SettingDef, value: string): string | null {
  switch (def.type) {
    case 'flag':
      return value === 'true' || value === 'false' ? null : 'must be "true" or "false"';
    case 'duration':
      return /^\d+[smhd]?$/.test(value.trim()) ? null : 'must be a duration like 10m, 1h, 3600s';
    case 'csv':
      return value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean).length > 0
        ? null
        : 'must be a non-empty comma-separated list';
    case 'text':
      return value.length > 0 ? null : 'must not be empty';
    default:
      return 'unknown setting type';
  }
}
