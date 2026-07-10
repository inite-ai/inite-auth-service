import { IsArray, IsString, MaxLength } from 'class-validator';

/** Update a custom role's display name + permission set. Slug comes from the
 *  path and is immutable; system roles are rejected in the service. */
export class UpdateRoleDto {
  @IsString()
  @MaxLength(128)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}
