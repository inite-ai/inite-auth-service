import { IsArray, IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateStreamDto {
  @IsIn(['push', 'poll'])
  delivery_method!: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_tld: false })
  push_endpoint_url?: string;

  @IsOptional()
  @IsString()
  push_auth_header?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events_requested?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aud?: string[];

  /** Superadmin only — scoped admins are pinned to their own tenant. */
  @IsOptional()
  @IsString()
  companyId?: string;
}
