import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  /** URL-safe slug; also used as the bridged companyId when not given. */
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,62}$/, { message: 'slug must be lowercase alphanumeric/hyphen' })
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyId?: string;
}
