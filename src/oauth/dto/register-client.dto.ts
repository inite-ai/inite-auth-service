import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/**
 * RFC 7591 Dynamic Client Registration request metadata.
 *
 * This backs a PUBLIC, unauthenticated endpoint, so every field is
 * validated strictly. All fields are optional at the DTO layer; the
 * registry method (registerDynamicClient) enforces the cross-field
 * guardrails (redirect_uris required for authorization_code, grant/
 * scope allow-lists, public-client secret rules).
 */
export class RegisterClientDto {
  @IsOptional()
  @IsArray()
  @IsUrl({ require_tld: false }, { each: true })
  redirect_uris?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  client_name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  grant_types?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  response_types?: string[];

  @IsOptional()
  @IsIn(['client_secret_post', 'none'])
  token_endpoint_auth_method?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  logo_uri?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  policy_uri?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  tos_uri?: string;
}
