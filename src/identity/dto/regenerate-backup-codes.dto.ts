import { IsString } from 'class-validator';

/** Re-mint 2FA recovery codes; requires the current password. */
export class RegenerateBackupCodesDto {
  @IsString()
  password!: string;
}
