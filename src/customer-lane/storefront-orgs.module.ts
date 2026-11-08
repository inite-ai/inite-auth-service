import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorefrontOrgsController } from './storefront-orgs.controller';
import { StorefrontOrgsGuard } from './storefront-orgs.guard';
import { StorefrontOrgsService } from './storefront-orgs.service';

/**
 * Storefront orgs (issue #304): /v1/customer-lane/orgs. AuthModule provides
 * the JWT strategy the guard extends; PrismaService and the audit service
 * are global.
 */
@Module({
  imports: [AuthModule],
  controllers: [StorefrontOrgsController],
  providers: [StorefrontOrgsService, StorefrontOrgsGuard],
})
export class StorefrontOrgsModule {}
