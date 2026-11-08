import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * POST /v1/auth/telegram/webapp: a Mini App's initData plus the parameters of
 * the /authorize it stands in for. The answer is an authorization code that
 * the client redeems at /v1/oauth/token with its PKCE verifier, as after any
 * other sign-in.
 */
export class TelegramWebAppDto {
  /** `Telegram.WebApp.initData`, the raw signed query string. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  init_data!: string;

  @IsString()
  @IsNotEmpty()
  client_id!: string;

  @IsString()
  @IsNotEmpty()
  redirect_uri!: string;

  @IsString()
  @IsNotEmpty()
  code_challenge!: string;

  @IsOptional()
  @IsIn(['S256'])
  code_challenge_method?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  nonce?: string;

  /** RFC 8707 Resource Indicator, bound to the token's `aud` at /token. */
  @IsOptional()
  @IsString()
  resource?: string;

  /**
   * False: a Telegram user no INITE account is linked to gets no account and
   * no code, but a 409 `telegram_not_linked` with a link ticket (see
   * TelegramLinkService). For a Mini App that serves only existing accounts.
   */
  @IsOptional()
  @IsBoolean()
  create_user?: boolean;
}
