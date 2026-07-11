import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SuperadminGuard } from '../auth/guards/superadmin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { SettingsAdminService } from './settings-admin.service';
import { UpdateSettingDto } from './dto/update-setting.dto';

/**
 * Admin API for operator-tunable runtime settings (feature flags, token TTLs,
 * RAR types, mTLS config). These are global — a company admin must not flip
 * server-wide security features — so the whole controller is superadmin-only.
 * A DB override shadows the env value; DELETE reverts to env. Every write is
 * audit-logged.
 */
@ApiTags('admin')
@Controller({ path: 'admin/settings', version: '1' })
@UseGuards(SuperadminGuard)
export class SettingsAdminController {
  constructor(private readonly settings: SettingsAdminService) {}

  @Get()
  list() {
    return this.settings.list();
  }

  @Put(':key')
  set(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settings.set(key, dto.value, actorOf(user));
  }

  @Delete(':key')
  reset(@Param('key') key: string, @CurrentUser() user: AuthenticatedUser) {
    return this.settings.reset(key, actorOf(user));
  }
}

/** A stable identifier for the acting admin, for the audit trail. */
function actorOf(user: AuthenticatedUser): string | null {
  const principal = user as { did?: string; userId?: string; sub?: string };
  return principal.did ?? principal.userId ?? principal.sub ?? null;
}
