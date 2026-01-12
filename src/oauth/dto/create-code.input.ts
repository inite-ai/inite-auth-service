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
}





