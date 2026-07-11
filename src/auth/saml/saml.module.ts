import { Module } from '@nestjs/common';
import { AuthModule } from '../auth.module';
import { SamlController } from './saml.controller';
import { SamlAdminController } from './saml-admin.controller';
import { SamlService } from './saml.service';
import { SamlConnectionStore } from './saml-connection.store';
import { SamlAdminService } from './saml-admin.service';
import { SamlEnabledGuard } from './saml-enabled.guard';

/**
 * SAML 2.0 Service Provider (inbound enterprise SSO), gated by SAML_ENABLED.
 * PR 1: SP metadata + admin connection provisioning. AuthModule supplies the
 * AdminGuard (JWT strategy) for the admin surface; FieldCrypto + PrismaService
 * are global.
 */
@Module({
  imports: [AuthModule],
  controllers: [SamlController, SamlAdminController],
  providers: [SamlService, SamlConnectionStore, SamlAdminService, SamlEnabledGuard],
  exports: [SamlService, SamlConnectionStore],
})
export class SamlModule {}
