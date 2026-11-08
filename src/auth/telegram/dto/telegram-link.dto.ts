import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** POST /v1/auth/telegram/link: the ticket a Mini App sign-in handed out. */
export class TelegramLinkDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  ticket!: string;
}
