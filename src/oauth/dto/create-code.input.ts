import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateCodeInput {
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsString()
  @IsNotEmpty()
  redirectUri: string;

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

  /**
   * RFC 8707 resource indicator. When the user-facing consent screen
   * forwards an MCP-style authorization request that carried a
   * `resource` query param, this echoes it back so the issued code
   * binds the eventual access token's `aud` to the resource server
   * instead of the clientId.
   */
  @IsString()
  @IsOptional()
  resource?: string;
}





