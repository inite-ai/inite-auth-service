import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthClient } from '@prisma/client';
import { OAuthClientRegistryService } from './oauth-client-registry.service';
import { ClientAssertionService, CLIENT_ASSERTION_TYPE } from './client-assertion.service';

/** The client-authentication fields read off a token / PAR request body. */
export interface ClientAuthBody {
  client_id?: string;
  client_secret?: string;
  client_assertion?: string;
  client_assertion_type?: string;
}

/**
 * Dispatches client authentication at the token + PAR endpoints. A
 * `client_assertion` takes the private_key_jwt path (RFC 7523); otherwise the
 * shared-secret path (client_secret_post). A client registered for
 * private_key_jwt cannot fall back to a secret and vice-versa (no downgrade).
 */
@Injectable()
export class ClientAuthService {
  constructor(
    private readonly registry: OAuthClientRegistryService,
    private readonly assertion: ClientAssertionService,
    private readonly config: ConfigService,
  ) {}

  async authenticate(input: {
    body: ClientAuthBody;
    audiences: string[];
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

    const client = await this.registry.validateClientWithSecret(
      client_id ?? '',
      client_secret ?? '',
    );
    if (client.tokenEndpointAuthMethod === 'private_key_jwt') {
      throw new UnauthorizedException('client must authenticate with private_key_jwt');
    }
    return client;
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
