import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
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

  private assertSuperadmin(req: any): void {
    const scope = resolveAdminScope(req.user);
    if (!scope || scope.kind !== 'superadmin') {
      throw new ForbiddenException('superadmin access required');
    }
  }

  @Get()
  list(@Req() req: any) {
    this.assertSuperadmin(req);
    return this.federation.list();
  }

  @Put(':slug')
  upsert(@Req() req: any, @Param('slug') slug: string, @Body() dto: UpsertFederationDto) {
    this.assertSuperadmin(req);
    return this.federation.upsert(slug, dto);
  }

  @Post(':slug/enable')
  enable(@Req() req: any, @Param('slug') slug: string) {
    this.assertSuperadmin(req);
    return this.federation.setEnabled(slug, true);
  }

  @Post(':slug/disable')
  disable(@Req() req: any, @Param('slug') slug: string) {
    this.assertSuperadmin(req);
    return this.federation.setEnabled(slug, false);
  }

  @Post(':slug/test')
  test(@Req() req: any, @Param('slug') slug: string) {
    this.assertSuperadmin(req);
    return this.federation.test(slug);
  }
}
