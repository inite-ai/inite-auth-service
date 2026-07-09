import { IsEmail, IsString } from 'class-validator';

/**
 * Body for POST /v1/auth/password/login.
 *
 * Both the SPA (components/PasswordAuth.tsx) and the embedded iframe
 * (app/embed/login/page.tsx) send exactly { email, password }.
 */
export class LoginWithPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
