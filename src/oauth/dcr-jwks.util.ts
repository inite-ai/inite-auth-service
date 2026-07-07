import { BadRequestException } from '@nestjs/common';

/**
 * Validate the key material an RFC 7591 registration presents for a
 * private_key_jwt client. Kept out of the (line-budgeted) registry service.
 *
 * - jwks and jwks_uri are mutually exclusive (RFC 7591 §2).
 * - a private_key_jwt client MUST supply one of them.
 * - jwks_uri must be https (SSRF).
 */
export function validateDcrClientKeys(input: {
  method: string | undefined;
  jwks: unknown;
  jwksUri: string | undefined;
}): void {
  const { method, jwks, jwksUri } = input;
  if (jwks && jwksUri) {
    throw new BadRequestException('jwks and jwks_uri are mutually exclusive');
  }
  if (method === 'private_key_jwt' && !jwks && !jwksUri) {
    throw new BadRequestException('private_key_jwt requires jwks or jwks_uri');
  }
  if (jwksUri) {
    let url: URL;
    try {
      url = new URL(jwksUri);
    } catch {
      throw new BadRequestException('jwks_uri must be a valid URL');
    }
    if (url.protocol !== 'https:') {
      throw new BadRequestException('jwks_uri must use https');
    }
  }
}
