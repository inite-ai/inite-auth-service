import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller()
export class HealthController {
  constructor(private readonly configService: ConfigService) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'inite-auth-service',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  @Get('.well-known/openid-configuration')
  openidConfiguration() {
    const issuer = this.configService.get<string>(
      'OIDC_ISSUER',
      'https://auth.inite.ai',
    );

    return {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      userinfo_endpoint: `${issuer}/oauth/userinfo`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: [
        'client_secret_post',
        'client_secret_basic',
      ],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
      claims_supported: [
        'sub',
        'email',
        'email_verified',
        'name',
        'picture',
        'did',
        'wallets',
        'roles',
        'entitlements',
      ],
    };
  }
}



