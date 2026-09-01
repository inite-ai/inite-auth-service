import { Type } from 'class-transformer';
import { IsInt, IsNotEmptyObject, IsString, ValidateNested } from 'class-validator';
import { TonProofDomainDto } from './ton-proof-domain.dto';

/** The `connectItems.tonProof.proof` object a TON Connect wallet returns. */
export class TonProofDto {
  @IsInt()
  timestamp!: number;

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => TonProofDomainDto)
  domain!: TonProofDomainDto;

  @IsString()
  signature!: string;

  @IsString()
  payload!: string;
}
