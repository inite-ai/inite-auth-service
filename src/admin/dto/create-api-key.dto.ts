import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** Admin payload to issue a long-lived opaque API key for a vertical. */
export class CreateApiKeyDto {
  @IsString()
  name!: string;

  /** Tenant (Organization.companyId). Ignored for scoped admins — forced to their tenant. */
  @IsOptional()
  @IsString()
  companyId?: string;

  /** RFC 8707 audience the key is valid for, e.g. 'brain'. */
  @IsString()
  audience!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  scopes!: string[];

  /** ABAC policy set names the vertical resolves for this key (introspection `policy`). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  policyNames?: string[];

  /** Optional owner user (UUID) — introspection then answers sub=user.did. */
  @IsOptional()
  @IsUUID()
  userId?: string;

  /** Optional TTL. Omit for a non-expiring key (revocation still applies). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number;
}
