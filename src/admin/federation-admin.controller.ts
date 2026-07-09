import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SuperadminGuard } from '../auth/guards/superadmin.guard';
import { FederationAdminService } from './federation-admin.service';
import { UpsertFederationDto } from './dto/upsert-federation.dto';

/**
 * Admin API for DB-backed social/OIDC federation provider config. Federation is
 * global (not tenant-scoped), so every route is superadmin-only — a company
 * admin must not repoint the shared login connectors. SuperadminGuard enforces
 * authenticate + admin + superadmin-scope for the whole controller.
 */
@ApiTags('admin')
@Controller({ path: 'admin/federation', version: '1' })
@UseGuards(SuperadminGuard)
export class FederationAdminController {
  constructor(private readonly federation: FederationAdminService) {}

  @Get()
  list() {
    return this.federation.list();
  }

  @Put(':slug')
  upsert(@Param('slug') slug: string, @Body() dto: UpsertFederationDto) {
    return this.federation.upsert(slug, dto);
  }

  @Post(':slug/enable')
  enable(@Param('slug') slug: string) {
    return this.federation.setEnabled(slug, true);
  }

  @Post(':slug/disable')
  disable(@Param('slug') slug: string) {
    return this.federation.setEnabled(slug, false);
  }

  @Post(':slug/test')
  test(@Param('slug') slug: string) {
    return this.federation.test(slug);
  }
}
