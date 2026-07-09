import { IsString } from 'class-validator';

/** Body for POST /v1/auth/passkey/delete. */
export class DeletePasskeyDto {
  @IsString()
  passkeyId!: string;
}
