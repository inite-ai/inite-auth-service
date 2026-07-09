import { IsEmail, IsString } from 'class-validator';

/** Request an email change; requires the current password. */
export class ChangeEmailDto {
  @IsEmail()
  newEmail!: string;

  @IsString()
  password!: string;
}
