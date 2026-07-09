import { IsString } from 'class-validator';

/** Disable 2FA; requires a current TOTP code and the account password. */
export class Disable2faDto {
  @IsString()
  code!: string;

  @IsString()
  password!: string;
}
