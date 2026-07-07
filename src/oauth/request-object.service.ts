import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as jose from 'jose';
import { OAuthClientRegistryService } from './oauth-client-registry.service';
import { ClientJwksService } from './client-jwks.service';
import { AuthorizeQuery } from './dto/oauth-requests';

/** Asymmetric algs a JAR request object may be signed with. */
const REQUEST_OBJECT_ALGS = [
  'RS256', 'RS384', 'RS512',
  'PS256', 'PS384', 'PS512',
  'ES256', 'ES384', 'ES512',
  'EdDSA',
];

/**
 * JAR — signed request objects (RFC 9101). The `request` parameter is a JWT
 * signed by the client whose claims replace the corresponding query params.
 * Signed-only (reject `alg: none`); verified against the client's registered
 * keys. Its `client_id` must match the outer request.
 */
@Injectable()
export class RequestObjectService {
  constructor(
    private readonly registry: OAuthClientRegistryService,
    private readonly clientJwks: ClientJwksService,
  ) {}

  async resolve(input: { request: string; clientId?: string }): Promise<Partial<AuthorizeQuery>> {
    const header = this.decodeHeader(input.request);
    if (!header.alg || !REQUEST_OBJECT_ALGS.includes(header.alg)) {
      throw new BadRequestException(`request object alg ${header.alg ?? 'none'} not allowed`);
    }
    const unverified = this.decodePayload(input.request);
    const clientId = input.clientId ?? (unverified.client_id as string | undefined);
    if (!clientId) throw new BadRequestException('client_id is required with a request object');

    const client = await this.registry.validateClient(clientId);
    const keySet = this.clientJwks.resolveKeySet(client);
    let payload: jose.JWTPayload;
    try {
      ({ payload } = await jose.jwtVerify(input.request, keySet, { algorithms: REQUEST_OBJECT_ALGS }));
    } catch {
      throw new UnauthorizedException('request object signature invalid');
    }
    if (payload.client_id && payload.client_id !== clientId) {
      throw new BadRequestException('request object client_id mismatch');
    }
    return this.pickAuthorizeParams(payload);
  }

  private decodeHeader(request: string): jose.ProtectedHeaderParameters {
    try {
      return jose.decodeProtectedHeader(request);
    } catch {
      throw new BadRequestException('malformed request object');
    }
  }

  private decodePayload(request: string): jose.JWTPayload {
    try {
      return jose.decodeJwt(request);
    } catch {
      throw new BadRequestException('malformed request object');
    }
  }

  private pickAuthorizeParams(p: jose.JWTPayload): Partial<AuthorizeQuery> {
    const out: Partial<AuthorizeQuery> = {};
    const keys: Array<keyof AuthorizeQuery> = [
      'response_type', 'client_id', 'redirect_uri', 'scope', 'state',
      'code_challenge', 'code_challenge_method', 'prompt', 'nonce',
      'acr_values', 'resource',
    ];
    for (const key of keys) {
      const value = (p as Record<string, unknown>)[key];
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  }
}
