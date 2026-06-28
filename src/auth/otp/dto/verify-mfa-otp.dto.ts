import { IsString, Matches } from 'class-validator';

/** Verify a step-up (MFA) code for the authenticated user. */
export class VerifyMfaOtpDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}
