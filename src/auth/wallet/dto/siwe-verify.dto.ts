import { IsString } from 'class-validator';

/** Verify a signed EIP-4361 challenge. */
export class SiweVerifyDto {
  @IsString()
  message!: string;

  @IsString()
  signature!: string;
}
