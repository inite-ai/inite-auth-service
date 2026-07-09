import { IsString } from 'class-validator';

/** Confirm an email address with the verification token. */
export class VerifyEmailDto {
  @IsString()
  token!: string;
}
