import { IsString } from 'class-validator';

/** Request a SIWE / TON challenge message to sign for wallet linking. */
export class WalletMessageDto {
  @IsString()
  address!: string;

  @IsString()
  nonce!: string;
}
