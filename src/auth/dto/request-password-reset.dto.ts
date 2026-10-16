import { Type } from 'class-transformer';
import { IsEmail, IsOptional, ValidateNested } from 'class-validator';
import { MagicLinkOAuthParamsDto } from './magic-link-oauth-params.dto';

/**
 * Body for POST /v1/auth/password/reset-request.
 *
 * `oauthParams` is the /authorize continuation the person was in when they
 * asked for the link (e.g. an invite from a client app). It is stored with the
 * reset token — exactly like a magic link — so finishing the reset resumes
 * that flow instead of stranding the person on the account page. The resumed
 * /authorize re-validates every value, so nothing here is trusted.
 */
export class RequestPasswordResetDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MagicLinkOAuthParamsDto)
  oauthParams?: MagicLinkOAuthParamsDto;
}
