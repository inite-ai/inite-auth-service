import { IsEmail, IsString, Matches } from 'class-validator';

/** Verify a one-time login code for an email address. */
export class VerifyOtpLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}
