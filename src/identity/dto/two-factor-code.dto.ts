import { IsString } from 'class-validator';

/** A single TOTP code (used to enable and to verify 2FA). */
export class TwoFactorCodeDto {
  @IsString()
  code!: string;
}
