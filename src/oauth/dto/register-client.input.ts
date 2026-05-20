import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ArrayMinSize,
  IsUrl,
  ArrayUnique,
} from 'class-validator';

/**
 * Dynamic Client Registration request body (RFC 7591 §2).
 *
 * We intentionally accept only a tight subset of the spec's metadata
 * because DCR on this server is scoped to public clients (MCP/native
 * callers using PKCE). Confidential clients still flow through
 * /v1/admin/oauth-clients. The narrow surface keeps the attack
 * surface predictable and lets us reject self-registrations that
 * try to grant themselves broader powers (scopes outside the
 * whitelist, additional grant types, etc.) at the DTO layer rather
 * than relying on service-level checks.
 */
export class RegisterClientInput {
  /**
   * REQUIRED per RFC 7591 for the authorization_code grant. At least
   * one entry; each must be a syntactically valid URL. The service
   * additionally enforces the OAuth 2.1 / RFC 8252 rule that only
   * HTTPS or loopback (`http://127.0.0.1` / `http://[::1]`) is
   * acceptable — public-client redirect URIs sent over plain http
   * to a third-party host would leak codes in flight.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] }, { each: true })
  redirect_uris: string[];

  /**
   * Locked to "none" — DCR on this server issues public clients
   * exclusively. We still accept the field so well-behaved RFC 7591
   * clients can echo their intent; we reject everything else.
   */
  @IsOptional()
  @IsIn(['none'])
  token_endpoint_auth_method?: 'none';

  /**
   * Subset of {authorization_code, refresh_token}. RFC 7591 default
   * is ["authorization_code"]; we additionally allow refresh_token so
   * MCP sessions can survive an access-token expiry without bouncing
   * the user back through the browser.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(['authorization_code', 'refresh_token'], { each: true })
  grant_types?: Array<'authorization_code' | 'refresh_token'>;

  /** Locked to ["code"] — implicit/hybrid flows are not implemented. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(['code'], { each: true })
  response_types?: Array<'code'>;

  /**
   * Space-separated scope string per RFC 7591 §2. Service validates
   * each token against an allowlist (see DCR_SCOPE_ALLOWLIST in
   * OAuthService); anything outside the list 400s. We don't accept
   * arbitrary scopes here because a self-registered client must not
   * be able to ask for, e.g., `brain:admin`.
   */
  @IsOptional()
  @IsString()
  scope?: string;

  /** Human-readable name shown on the consent screen. */
  @IsOptional()
  @IsString()
  client_name?: string;

  /** Homepage URL. */
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  client_uri?: string;

  /** Logo URL surfaced on the consent screen. */
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  logo_uri?: string;

  /** Privacy policy URL surfaced on the consent screen. */
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  policy_uri?: string;

  /** Terms of service URL surfaced on the consent screen. */
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  tos_uri?: string;
}
