import { IsString } from 'class-validator';

/** Delete the account; requires the current password. */
export class DeleteAccountDto {
  @IsString()
  password!: string;
}
