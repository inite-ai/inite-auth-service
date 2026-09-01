import { IsInt, IsString } from 'class-validator';

/** The `domain` member of a TON Connect proof — the RP the wallet signed for. */
export class TonProofDomainDto {
  @IsInt()
  lengthBytes!: number;

  @IsString()
  value!: string;
}
