import { BadRequestException } from '@nestjs/common';
import { BlockedFetch, checkUrl } from '../common/safe-fetch-address';

/**
 * Validate the key material an RFC 7591 registration presents for a
 * private_key_jwt client. Kept out of the (line-budgeted) registry service.
 *
 * - jwks and jwks_uri are mutually exclusive (RFC 7591 §2).
 * - a private_key_jwt client MUST supply one of them.
 * - jwks_uri must be https (SSRF), on port 443 (or 80), with no credentials,
 *   and must not name a literal private/loopback/metadata IP or an internal
 *   name. A name that only RESOLVES privately is refused when it is fetched
 *   (ClientJwksService → safeFetch), since DNS can change after registration.
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
    assertFetchableJwksUri(url);
  }
  if (jwks) assertPublicJwks(jwks);
}

/**
 * Reject a JWK Set that contains private key material — only public keys may
 * be registered to verify a client's assertions/request objects. A JWK with a
 * `d` parameter (RSA/EC private exponent) or an `oct` symmetric key is private.
 */
export function assertPublicJwks(jwks: unknown): void {
  const keys = (jwks as { keys?: unknown })?.keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new BadRequestException('jwks must be a JWK Set with a non-empty keys array');
  }
  for (const key of keys) {
    const jwk = key as { d?: unknown; kty?: unknown };
    if (jwk && (jwk.d !== undefined || jwk.kty === 'oct')) {
      throw new BadRequestException('jwks must contain only public keys (found private key material)');
    }
  }
}

function assertFetchableJwksUri(url: URL): void {
  try {
    checkUrl(url, { requireHttps: true });
  } catch (err) {
    if (err instanceof BlockedFetch) {
      throw new BadRequestException(`jwks_uri is not fetchable: ${err.message}`);
    }
    throw err;
  }
}
