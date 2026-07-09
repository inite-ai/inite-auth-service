import { IsString } from 'class-validator';

/**
 * Body for POST /v1/auth/password/reset.
 *
 * No @MinLength/@Matches on password — the service enforces the password
 * policy (breached-password checks, strength); a length cap here would
 * reject currently-valid resets.
 */
export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  password!: string;
}
