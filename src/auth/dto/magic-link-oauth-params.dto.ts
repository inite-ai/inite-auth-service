import { IsOptional, IsString } from 'class-validator';

/**
 * Nested OAuth continuation params carried by a magic-link request so the
 * link can resume the /authorize flow after verification.
 *
 * The SPA (components/MagicLinkAuth.tsx) forwards the WHOLE object produced
 * by useOAuthParams() (components/auth-page/shared.tsx) whenever a clientId
 * is present. That object is built from URLSearchParams.get(...), so every
 * field can be `null` (absent query param) — @IsOptional treats null/undefined
 * as "missing" and skips @IsString, matching the previously-unvalidated
 * behaviour. All eleven keys it can send are whitelisted here so a live
 * OAuth-flow magic-link request is not rejected by forbidNonWhitelisted.
 *
 * Keep in step with OAuthParamsDto (the stored shape) and the frontend's
 * OAuthParams — a key absent from any of the three is a param that dies at
 * the magic link.
 */
export class MagicLinkOAuthParamsDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  redirectUri?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  codeChallenge?: string;

  @IsOptional()
  @IsString()
  codeChallengeMethod?: string;

  @IsOptional()
  @IsString()
  acrValues?: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  nonce?: string;

  /** RFC 8707 Resource Indicator — target resource for the issued token. */
  @IsOptional()
  @IsString()
  resource?: string;

  /** RFC 9396 raw `authorization_details` JSON. */
  @IsOptional()
  @IsString()
  authorizationDetails?: string;
}
