import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuthClient } from '@prisma/client';
import * as jose from 'jose';

/**
 * Resolves the verification key set for a client, from either an inline RFC
 * 7517 JWK Set (`jwks`) or a remote `jwks_uri`. Shared by private_key_jwt
 * client authentication (RFC 7523) and signed request objects (JAR, RFC 9101).
 *
 * SSRF hardening: `jwks_uri` must be https. jose's remote key set caches keys,
 * cools down between refetches, and re-fetches on a kid miss.
 */
@Injectable()
export class ClientJwksService {
  private static readonly REMOTE_TIMEOUT_MS = 3000;

  resolveKeySet(client: OAuthClient): jose.JWTVerifyGetKey {
    if (client.jwks && typeof client.jwks === 'object') {
      return jose.createLocalJWKSet(client.jwks as unknown as jose.JSONWebKeySet);
    }
    if (client.jwksUri) {
      const url = new URL(client.jwksUri);
      if (url.protocol !== 'https:') {
        throw new UnauthorizedException('client jwks_uri must use https');
      }
      return jose.createRemoteJWKSet(url, {
        timeoutDuration: ClientJwksService.REMOTE_TIMEOUT_MS,
      });
    }
    throw new UnauthorizedException('client has no registered keys');
  }
}
