import { IsEmail, IsOptional, IsString } from 'class-validator';

/**
 * Body for POST /v1/auth/passkey/prepare-registration.
 *
 * Frontend (components/PasskeyAuth.tsx) sends { email } only; name is
 * optional on the wire.
 */
export class PreparePasskeyRegistrationDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  name?: string;
}
