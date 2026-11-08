import { Body, Controller, HttpCode, Post, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OAuthClientRegistryService } from './oauth-client-registry.service';
import { RegisterClientDto } from './dto/register-client.dto';
import { DcrMetadataPipe } from './dcr-metadata.pipe';
import { registerErrors } from './oauth-error.interceptor';

/**
 * RFC 7591 Dynamic Client Registration endpoint.
 *
 * Public and unauthenticated — MCP clients self-register here. Shares
 * the /v1/oauth route prefix with OAuthController/TokenController. All
 * privilege-escalation guardrails live in registerDynamicClient; this
 * controller is a thin HTTP shell that shapes the RFC 7591 response.
 *
 * The body is typed `unknown` on purpose: the global ValidationPipe skips an
 * untyped body, and DcrMetadataPipe validates it against RegisterClientDto
 * while ignoring unknown metadata (RFC 7591 §3.1). Errors answer in RFC 7591
 * §3.2.2 shape (registerErrors).
 */
@ApiTags('oauth')
@Controller({ path: 'oauth', version: '1' })
export class OAuthRegisterController {
  constructor(private readonly clientRegistry: OAuthClientRegistryService) {}

  @Post('register')
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(registerErrors)
  @ApiBody({ type: RegisterClientDto })
  async register(@Body(DcrMetadataPipe) dto: unknown) {
    const { client, clientSecret } =
      await this.clientRegistry.registerDynamicClient(dto as RegisterClientDto);

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
