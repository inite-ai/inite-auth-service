import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthClient } from '@prisma/client';
import type { Request } from 'express';
import { OAuthClientRegistryService } from './oauth-client-registry.service';
import { ClientAssertionService, CLIENT_ASSERTION_TYPE } from './client-assertion.service';
import { MtlsService } from './mtls.service';

/** The client-authentication fields read off a token / PAR request body. */
export interface ClientAuthBody {
  client_id?: string;
  client_secret?: string;
  client_assertion?: string;
  client_assertion_type?: string;
}

/**
 * Dispatches client authentication at the token + PAR endpoints. A
 * `client_assertion` takes the private_key_jwt path (RFC 7523); a forwarded
 * client certificate takes the mTLS path (RFC 8705); otherwise the shared-secret
 * path (client_secret_post). A client registered for one method cannot fall back
 * to another (no downgrade).
 */
@Injectable()
export class ClientAuthService {
  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly registry: OAuthClientRegistryService,
    private readonly assertion: ClientAssertionService,
    private readonly config: ConfigService,
    private readonly mtls: MtlsService,
  ) {}

  async authenticate(input: {
    body: ClientAuthBody;
    audiences: string[];
    req?: Request;
  }): Promise<OAuthClient> {
    const { client_assertion, client_assertion_type, client_id, client_secret } = input.body;

    if (client_assertion) {
      if (client_secret) {
        throw new BadRequestException('present either client_secret or client_assertion, not both');
      }
      if (client_assertion_type !== CLIENT_ASSERTION_TYPE) {
        throw new BadRequestException('unsupported client_assertion_type');
      }
      return this.assertion.authenticate({
        assertion: client_assertion,
        clientIdHint: client_id,
        audiences: input.audiences,
      });
    }

    // RFC 8705 — a forwarded client certificate authenticates a client
    // provisioned for tls_client_auth / self_signed_tls_client_auth.
    const viaMtls = await this.tryMtlsAuthenticate(input.req, client_id, client_secret);
    if (viaMtls) return viaMtls;

    const client = await this.registry.validateClientWithSecret(
      client_id ?? '',
      client_secret ?? '',
    );
    if (client.tokenEndpointAuthMethod === 'private_key_jwt') {
      throw new UnauthorizedException('client must authenticate with private_key_jwt');
    }
    // No downgrade: an mTLS client must present a certificate, not a secret.
    if (this.mtls.usesMtls(client)) {
      throw new UnauthorizedException('client must authenticate with mTLS');
    }
    return client;
  }

  /**
   * RFC 8705 mTLS branch. Returns the authenticated client when a forwarded
   * certificate is present and mTLS is enabled, else null so the caller falls
   * through to the shared-secret path.
   */
  private async tryMtlsAuthenticate(
    req: Request | undefined,
    clientId: string | undefined,
    clientSecret: string | undefined,
  ): Promise<OAuthClient | null> {
    if (!req || !this.mtls.isEnabled()) return null;
    const cert = this.mtls.presentedCertificate(req);
    if (!cert) return null;
    if (clientSecret) {
      throw new BadRequestException(
        'present either client_secret or a client certificate, not both',
      );
    }
    return this.mtls.authenticate(clientId ?? '', cert);
  }

  /** Acceptable `aud` values for an assertion sent to the token endpoint. */
  tokenAudiences(): string[] {
    return this.audiencesFor('/v1/oauth/token');
  }

  /** Acceptable `aud` values for an assertion sent to the PAR endpoint. */
  parAudiences(): string[] {
    return this.audiencesFor('/v1/oauth/par');
  }

  private audiencesFor(path: string): string[] {
    const issuer = this.config.get<string>('JWT_ISSUER', 'http://localhost:3002');
    return [issuer, `${issuer}${path}`];
  }
}
