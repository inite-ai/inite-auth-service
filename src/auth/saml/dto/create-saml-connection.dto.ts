import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

/** Admin payload to provision a per-tenant inbound SAML IdP connection. */
export class CreateSamlConnectionDto {
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;

  /** IdP EntityID (expected Issuer on inbound assertions). */
  @IsString()
  @IsNotEmpty()
  idpEntityId!: string;

  /** IdP Single Sign-On URL (redirect binding). */
  @IsUrl({ require_tld: false })
  idpSsoUrl!: string;

  /** IdP X.509 signing certificate (PEM). Stored encrypted at rest. */
  @IsString()
  @IsNotEmpty()
  idpCert!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
