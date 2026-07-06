import { IsString, Matches } from 'class-validator';

/** Request an EIP-4361 sign-in challenge for an EVM address. */
export class SiweChallengeDto {
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'address must be a 0x EVM address' })
  address!: string;
}
