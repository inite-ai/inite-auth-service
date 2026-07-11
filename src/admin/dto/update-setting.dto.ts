import { IsString } from 'class-validator';

/** Admin payload to set a runtime setting's DB override value. */
export class UpdateSettingDto {
  @IsString()
  value!: string;
}
