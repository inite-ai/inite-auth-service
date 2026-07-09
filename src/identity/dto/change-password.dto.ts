import { IsString } from 'class-validator';

/** Change the account password. Policy is enforced by the service. */
export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  newPassword!: string;
}
