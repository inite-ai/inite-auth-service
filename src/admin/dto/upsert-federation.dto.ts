import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/**
 * Admin upsert of a federation provider's DB-backed config. The secret is
 * write-only: omit it to keep the stored value; send a new value to replace it.
 */
export class UpsertFederationDto {
  @IsString()
  @MaxLength(256)
  clientId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  clientSecret?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  /** OIDC generic connector only. */
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_tld: false })
  @MaxLength(512)
  issuer?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
