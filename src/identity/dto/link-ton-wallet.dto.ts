import { Type } from 'class-transformer';
import { IsNotEmptyObject, IsString, ValidateNested } from 'class-validator';
import { TonProofDto } from './ton-proof.dto';

/** Link a TON wallet by presenting a TON Connect ton_proof. */
export class LinkTonWalletDto {
  @IsString()
  address!: string;

  @IsString()
  publicKey!: string;

  @IsString()
  walletStateInit!: string;

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => TonProofDto)
  proof!: TonProofDto;
}
