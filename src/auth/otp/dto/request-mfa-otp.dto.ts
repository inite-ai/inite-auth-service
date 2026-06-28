import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

/** Request a step-up (MFA) code for the authenticated user. */
export class RequestMfaOtpDto {
  @IsIn(['email', 'sms'])
  channel!: 'email' | 'sms';

  /** Required when channel is sms (E.164, e.g. +14155550123). */
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be E.164 format' })
  phone?: string;
}
