import { IsArray, IsString, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MaxLength(64)
  slug!: string;

  @IsString()
  @MaxLength(128)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}
