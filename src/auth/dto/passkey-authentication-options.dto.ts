import { IsOptional, IsString } from 'class-validator';

/**
 * Body for POST /v1/auth/passkey/authentication/options.
 *
 * Frontend (components/PasskeyAuth.tsx) sends { email } (to scope to a user's
 * credentials) or {} (discoverable-credential / conditional-UI flow).
 *
 * `email` is validated with @IsString, NOT @IsEmail: it is an optional
 * scoping hint, and a non-email value previously returned a generic
 * discoverable challenge rather than 400. Keeping @IsString preserves that.
 */
export class PasskeyAuthenticationOptionsDto {
  @IsOptional()
  @IsString()
  email?: string;
}
