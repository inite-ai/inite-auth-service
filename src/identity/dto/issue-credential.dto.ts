import { IsObject, IsString } from 'class-validator';

/**
 * Issue a verifiable credential. `claims` is an opaque credential subject
 * blob validated downstream by the VC library — kept permissive on purpose.
 */
export class IssueCredentialDto {
  @IsString()
  type!: string;

  @IsObject()
  claims!: Record<string, unknown>;
}
