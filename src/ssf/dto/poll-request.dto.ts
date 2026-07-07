import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PollRequestDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acks?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxEvents?: number;
}
