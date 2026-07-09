import { IsEmail, IsOptional, IsString } from 'class-validator';

/**
 * Body for POST /v1/auth/password/register.
 *
 * Frontend (components/PasswordAuth.tsx) sends { email, password, name }
 * on register — name defaults to the email local-part client-side but is
 * still optional on the wire.
 */
export class RegisterWithPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;
}
