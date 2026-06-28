import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { FederationService } from './federation.service';
import { FederationProviders } from './federation-providers.service';
import { FederationController } from './federation.controller';

/**
 * Social login / external IdP federation (Google, GitHub, generic OIDC).
 * PrismaService, RedisService and ConfigService come from global modules;
 * IdentityService (DID issuance / user creation) is imported explicitly.
 */
@Module({
  imports: [IdentityModule],
  providers: [FederationService, FederationProviders],
  controllers: [FederationController],
  exports: [FederationService],
})
export class FederationModule {}
