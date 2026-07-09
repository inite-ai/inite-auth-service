import { Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { MagicLinkOAuthParamsDto } from './magic-link-oauth-params.dto';

/**
 * Body for POST /v1/auth/email/send-magic-link.
 *
 * Two live shapes:
 *  - SPA (components/MagicLinkAuth.tsx): { email, oauthParams? }
 *  - Embedded iframe (app/embed/login/page.tsx): { email, clientId }
 *
 * The controller only reads email + oauthParams; the embed's top-level
 * clientId is currently ignored but MUST be whitelisted or the embed
 * request 400s under forbidNonWhitelisted.
 */
export class SendMagicLinkDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MagicLinkOAuthParamsDto)
  oauthParams?: MagicLinkOAuthParamsDto;
}
