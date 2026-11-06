import { IsOptional, IsString, Matches } from 'class-validator';

/** POST /v1/auth/telegram/unlink: one Telegram id, or every one when absent. */
export class TelegramUnlinkDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,20}$/)
  telegram_id?: string;
}
