import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OAuthClientRegistryService } from './oauth-client-registry.service';
import { RegisterClientDto } from './dto/register-client.dto';

/**
 * RFC 7591 Dynamic Client Registration endpoint.
 *
 * Public and unauthenticated — MCP clients self-register here. Shares
 * the /v1/oauth route prefix with OAuthController/TokenController. All
 * privilege-escalation guardrails live in registerDynamicClient; this
 * controller is a thin HTTP shell that shapes the RFC 7591 response.
 */
@ApiTags('oauth')
@Controller({ path: 'oauth', version: '1' })
export class OAuthRegisterController {
  constructor(private readonly clientRegistry: OAuthClientRegistryService) {}

  @Post('register')
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async register(@Body() dto: RegisterClientDto) {
    const { client, clientSecret } =
      await this.clientRegistry.registerDynamicClient(dto);

    const response: Record<string, unknown> = {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0,
      redirect_uris: client.redirectUris,
      grant_types: client.allowedGrants,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      client_name: client.name,
      scope: client.allowedScopes.join(' '),
    };

    // Echo registered key material for private_key_jwt / JAR clients.
    if (client.jwks) response.jwks = client.jwks;
    if (client.jwksUri) response.jwks_uri = client.jwksUri;

    // Never echo a secret for public clients — omit the field entirely
    // (RFC 7591 §3.2.1: client_secret only present for confidential).
    if (clientSecret !== null) {
      response.client_secret = clientSecret;
    }

    return response;
  }
}
