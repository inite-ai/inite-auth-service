import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { IMPORT_MAX_ROWS } from '../telegram-link.service';
import { TelegramImportRowDto } from './telegram-import-row.dto';

/** POST /v1/auth/telegram/identities/import: links a first-party product verified before auth knew Telegram. */
export class TelegramImportDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(IMPORT_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => TelegramImportRowDto)
  links!: TelegramImportRowDto[];
}
