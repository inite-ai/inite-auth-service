import { IsEmail } from 'class-validator';

/** Body for POST /v1/auth/password/reset-request. */
export class RequestPasswordResetDto {
  @IsEmail()
  email!: string;
}
