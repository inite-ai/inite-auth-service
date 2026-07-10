import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateCodeInput {
  // Definite-assignment: populated by the global ValidationPipe from the
  // request body; @IsNotEmpty guarantees presence at runtime.
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsString()
  @IsNotEmpty()
  redirectUri!: string;

  @IsString()
  @IsOptional()
  scope?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  codeChallenge?: string;

  @IsString()
  @IsOptional()
  codeChallengeMethod?: string;

  @IsString()
  @IsOptional()
  nonce?: string;

  @IsString()
  @IsOptional()
  acrValues?: string;

  /** RFC 8707 Resource Indicator — target resource for the issued token. */
  @IsString()
  @IsOptional()
  resource?: string;

  /** RFC 9396 raw `authorization_details` JSON, re-posted from the consent UI. */
  @IsString()
  @IsOptional()
  authorizationDetails?: string;
}





