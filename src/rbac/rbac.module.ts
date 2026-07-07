import { Global, Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { OrgRbacGuard } from './org-rbac.guard';

@Global()
@Module({
  providers: [RbacService, OrgRbacGuard],
  exports: [RbacService, OrgRbacGuard],
})
export class RbacModule {}
