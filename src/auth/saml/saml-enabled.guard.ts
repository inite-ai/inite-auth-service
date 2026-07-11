import {
  Injectable,
  CanActivate,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Gates the public SAML endpoints (metadata / start / ACS) on SAML_ENABLED —
 * when off, the whole surface 404s so a disabled feature can't be probed. No
 * authentication: metadata is public and ACS authenticates via the signed IdP
 * assertion, not a session.
 */
@Injectable()
export class SamlEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get<string>('SAML_ENABLED') !== 'true') {
      throw new NotFoundException('SAML is not enabled');
    }
    return true;
  }
}
