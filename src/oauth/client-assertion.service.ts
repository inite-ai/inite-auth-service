import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { OAuthClient } from '@prisma/client';
import * as jose from 'jose';
import { PrismaService } from '../prisma/prisma.service';
import { ClientJwksService } from './client-jwks.service';
import { ClientAssertionJtiStore } from './client-assertion-jti.store';

export const CLIENT_ASSERTION_TYPE =
  'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

/** Asymmetric algs we accept for a client assertion — never `none`/HS*. */
const ASSERTION_ALGS = [
  'RS256', 'RS384', 'RS512',
  'PS256', 'PS384', 'PS512',
  'ES256', 'ES384', 'ES512',
  'EdDSA',
];
const MAX_ASSERTION_LIFETIME_S = 300;

/**
 * Verifies a private_key_jwt client assertion (RFC 7523 / RFC 7521): the
 * client authenticates by signing a short-lived JWT with its own key instead
 * of presenting a shared secret. Verification order:
 *   1. alg is asymmetric (reject none/HS*)
 *   2. iss === sub === client_id
 *   3. client exists, is active, and is registered for private_key_jwt
 *   4. signature verifies against the client's keys; aud is us; not expired
 *   5. lifetime is bounded and jti is single-use
 */
@Injectable()
export class ClientAssertionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientJwks: ClientJwksService,
    private readonly jtiStore: ClientAssertionJtiStore,
  ) {}

  async authenticate(input: {
    assertion: string;
    clientIdHint?: string;
    audiences: string[];
  }): Promise<OAuthClient> {
    const { header, unverified } = this.decode(input.assertion);
    this.assertAlgAllowed(header.alg);
    const clientId = this.resolveClientId(input.clientIdHint, unverified);
    const client = await this.loadPrivateKeyJwtClient(clientId);

    const { payload } = await this.verifySignature(input, client, clientId);
    await this.enforceReplay(clientId, payload);
    return client;
  }

  private decode(assertion: string): { header: jose.ProtectedHeaderParameters; unverified: jose.JWTPayload } {
    try {
      return {
        header: jose.decodeProtectedHeader(assertion),
        unverified: jose.decodeJwt(assertion),
      };
    } catch {
      throw new UnauthorizedException('malformed client_assertion');
    }
  }

  private assertAlgAllowed(alg: string | undefined): void {
    if (!alg || !ASSERTION_ALGS.includes(alg)) {
      throw new UnauthorizedException(`client_assertion alg ${alg ?? 'none'} not allowed`);
    }
  }

  private resolveClientId(hint: string | undefined, payload: jose.JWTPayload): string {
    const clientId = hint ?? payload.sub;
    if (!clientId || payload.iss !== payload.sub || payload.sub !== clientId) {
      throw new UnauthorizedException('client_assertion iss/sub must equal client_id');
    }
    return clientId;
  }

  private async loadPrivateKeyJwtClient(clientId: string): Promise<OAuthClient> {
    const client = await this.prisma.oAuthClient.findFirst({ where: { clientId, active: true } });
    if (!client) throw new UnauthorizedException('unknown client');
    if (client.tokenEndpointAuthMethod !== 'private_key_jwt') {
      throw new UnauthorizedException('client is not registered for private_key_jwt');
    }
    return client;
  }

  private async verifySignature(
    input: { assertion: string; audiences: string[] },
    client: OAuthClient,
    clientId: string,
  ): Promise<jose.JWTVerifyResult> {
    const keySet = this.clientJwks.resolveKeySet(client);
    try {
      return await jose.jwtVerify(input.assertion, keySet, {
        algorithms: ASSERTION_ALGS,
        issuer: clientId,
        subject: clientId,
        audience: input.audiences,
        clockTolerance: 60,
      });
    } catch {
      throw new UnauthorizedException('client_assertion signature/claims invalid');
    }
  }

  private async enforceReplay(clientId: string, payload: jose.JWTPayload): Promise<void> {
    if (!payload.exp) throw new UnauthorizedException('client_assertion missing exp');
    if (!payload.jti) throw new UnauthorizedException('client_assertion missing jti');
    const nowS = Math.floor(Date.now() / 1000);
    if (payload.exp - nowS > MAX_ASSERTION_LIFETIME_S) {
      throw new BadRequestException('client_assertion lifetime too long (max 300s)');
    }
    await this.jtiStore.consume({
      clientId,
      jti: String(payload.jti),
      expiresAt: new Date(payload.exp * 1000),
    });
  }
}
