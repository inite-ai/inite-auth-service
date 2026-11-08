import { BadRequestException } from '@nestjs/common';

/** The one PKCE method this server supports (and advertises in discovery). */
export const PKCE_METHOD = 'S256';

/**
 * Throws unless the method is S256 or absent (absent means S256, RFC 7636
 * §4.3 would say plain, but this server never accepts plain). Every path that
 * stores a code passes here, so a `plain` challenge never reaches /token.
 */
export function assertS256Method(method: string | null | undefined): void {
  if (!method || method === PKCE_METHOD) return;
  throw new BadRequestException('Only the S256 code_challenge_method is supported');
}
