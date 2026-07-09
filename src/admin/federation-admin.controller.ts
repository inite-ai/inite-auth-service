import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { resolveAdminScope } from './admin-scope';
import { FederationAdminService } from './federation-admin.service';
import { UpsertFederationDto } from './dto/upsert-federation.dto';

/**
 * Admin API for DB-backed social/OIDC federation provider config. Federation is
 * global (not tenant-scoped), so every route is superadmin-only — a company
 * admin must not repoint the shared login connectors.
 */
@ApiTags('admin')
@Controller({ path: 'admin/federation', version: '1' })
@UseGuards(AdminGuard)
export class FederationAdminController {
  constructor(private readonly federation: FederationAdminService) {}

  private assertSuperadmin(user: AuthenticatedUser): void {
    const scope = resolveAdminScope(user);
    if (!scope || scope.kind !== 'superadmin') {
      throw new ForbiddenException('superadmin access required');
    }
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    this.assertSuperadmin(user);
    return this.federation.list();
  }

  @Put(':slug')
  upsert(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string, @Body() dto: UpsertFederationDto) {
    this.assertSuperadmin(user);
    return this.federation.upsert(slug, dto);
  }

  @Post(':slug/enable')
  enable(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    this.assertSuperadmin(user);
    return this.federation.setEnabled(slug, true);
  }

  @Post(':slug/disable')
  disable(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    this.assertSuperadmin(user);
    return this.federation.setEnabled(slug, false);
  }

  @Post(':slug/test')
  test(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    this.assertSuperadmin(user);
    return this.federation.test(slug);
  }
}
