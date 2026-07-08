import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { AuthModule } from '../auth.module';
import { FederationService } from './federation.service';
import { FederationProviders } from './federation-providers.service';
import { FederationConfigStore } from './federation-config.store';
import { FederationController } from './federation.controller';
import { FederationAdminController } from '../../admin/federation-admin.controller';
import { FederationAdminService } from '../../admin/federation-admin.service';

/**
 * Social login / external IdP federation (Google, GitHub, generic OIDC).
 * PrismaService, RedisService, ConfigService and FieldCrypto come from global
 * modules; IdentityService (DID issuance / user creation) is imported
 * explicitly; AuthModule provides the guards for the admin config API.
 */
@Module({
  imports: [IdentityModule, AuthModule],
  providers: [
    FederationService,
    FederationProviders,
    FederationConfigStore,
    FederationAdminService,
  ],
  controllers: [FederationController, FederationAdminController],
  exports: [FederationService, FederationConfigStore],
})
export class FederationModule {}
