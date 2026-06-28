import { IsEmail } from 'class-validator';

/** Request a one-time login code by email. */
export class RequestOtpLoginDto {
  @IsEmail()
  email!: string;
}
