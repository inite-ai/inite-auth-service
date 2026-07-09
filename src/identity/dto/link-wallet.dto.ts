import { IsOptional, IsString } from 'class-validator';

/** Link a blockchain wallet (EVM SIWE or TON). `publicKey` is TON-only. */
export class LinkWalletDto {
  @IsString()
  address!: string;

  @IsString()
  chain!: string;

  @IsString()
  message!: string;

  @IsString()
  signature!: string;

  @IsOptional()
  @IsString()
  publicKey?: string;
}
