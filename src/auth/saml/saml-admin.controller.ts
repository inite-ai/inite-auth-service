import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../guards/admin.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuthenticatedUser } from '../authenticated-user';
import { resolveAdminScope, AdminScope } from '../../admin/admin-scope';
import { SamlAdminService } from './saml-admin.service';
import { CreateSamlConnectionDto } from './dto/create-saml-connection.dto';

/**
 * Admin API to provision per-tenant SAML IdP connections, tenant-scoped like the
 * organizations admin. The IdP signing certificate is encrypted at rest and
 * never returned.
 */
@ApiTags('admin')
@Controller({ path: 'admin/saml/connections', version: '1' })
@UseGuards(AdminGuard)
export class SamlAdminController {
  constructor(private readonly saml: SamlAdminService) {}

  private scope(user: AuthenticatedUser): AdminScope {
    const scope = resolveAdminScope(user);
    if (!scope) throw new ForbiddenException('admin access required');
    return scope;
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.saml.list(this.scope(user));
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSamlConnectionDto) {
    return this.saml.create(this.scope(user), dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.saml.remove(this.scope(user), id);
    return { success: true };
  }
}
