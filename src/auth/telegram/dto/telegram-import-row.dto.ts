import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** One link a product verified: an INITE user and a Telegram user id. */
export class TelegramImportRowDto {
  /** The INITE user's DID (a token's `sub`) or id. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  user!: string;

  /** The numeric Telegram user id. */
  @IsString()
  @Matches(/^\d{1,20}$/)
  telegram_id!: string;
}
