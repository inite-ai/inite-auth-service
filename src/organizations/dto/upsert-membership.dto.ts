import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertMembershipDto {
  @IsString()
  userId!: string;

  /** Role slug — a system role (owner/admin/member/viewer) or a custom OrgRole. */
  @IsString()
  @MaxLength(64)
  role!: string;

  @IsOptional()
  @IsString()
  status?: string;
}
