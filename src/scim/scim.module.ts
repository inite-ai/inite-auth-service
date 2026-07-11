import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdentityModule } from '../identity/identity.module';
import { ScimUsersController } from './scim-users.controller';
import { ScimUsersService } from './scim-users.service';
import { ScimGroupsController } from './scim-groups.controller';
import { ScimGroupsService } from './scim-groups.service';
import { ScimDiscoveryController } from './scim-discovery.controller';
import { ScimGuard } from './scim.guard';

/**
 * SCIM 2.0 (RFC 7643/7644) inbound provisioning at /scim/v2, gated by
 * SCIM_ENABLED. AuthModule provides the JWT strategy the ScimGuard extends;
 * IdentityModule provides user create/lookup; SsfEmitterService (from the
 * global SsfModule) fires CAEP events on deprovision.
 */
@Module({
  imports: [AuthModule, IdentityModule],
  controllers: [ScimUsersController, ScimGroupsController, ScimDiscoveryController],
  providers: [ScimUsersService, ScimGroupsService, ScimGuard],
})
export class ScimModule {}
