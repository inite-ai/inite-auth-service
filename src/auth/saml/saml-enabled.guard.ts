import {
  Injectable,
  CanActivate,
  NotFoundException,
} from '@nestjs/common';
import { SettingsService } from '../../common/settings/settings.service';

/**
 * Gates the public SAML endpoints (metadata / start / ACS) on SAML_ENABLED —
 * when off, the whole surface 404s so a disabled feature can't be probed. No
 * authentication: metadata is public and ACS authenticates via the signed IdP
 * assertion, not a session.
 */
@Injectable()
export class SamlEnabledGuard implements CanActivate {
  constructor(private readonly settings: SettingsService) {}

  canActivate(): boolean {
    if (!this.settings.flag('SAML_ENABLED')) {
      throw new NotFoundException('SAML is not enabled');
    }
    return true;
  }
}
