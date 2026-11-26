import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PartnerRoleController } from './partner-role.controller';
import { PartnerRoleGuard } from './partner-role.guard';
import { PartnerRoleService } from './partner-role.service';

/**
 * The partner role door: POST /v1/service/users/partner-role. AuthModule
 * provides the JWT strategy the guard extends; PrismaService and the audit
 * service are global.
 */
@Module({
  imports: [AuthModule],
  controllers: [PartnerRoleController],
  providers: [PartnerRoleService, PartnerRoleGuard],
})
export class PartnerRoleModule {}
