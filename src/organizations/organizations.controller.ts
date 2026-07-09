import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { resolveAdminScope, AdminScope } from '../admin/admin-scope';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpsertMembershipDto } from './dto/upsert-membership.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

/**
 * Admin API for organizations, memberships, and custom roles. Tenant-scoped:
 * a company-scoped admin only sees/edits its own organization.
 */
@ApiTags('admin')
@Controller({ path: 'admin/organizations', version: '1' })
@UseGuards(AdminGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  private scope(user: AuthenticatedUser): AdminScope {
    const scope = resolveAdminScope(user);
    if (!scope) throw new ForbiddenException('admin access required');
    return scope;
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.organizations.list(this.scope(user));
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrganizationDto) {
    return this.organizations.create(this.scope(user), dto);
  }

  @Get(':orgId')
  get(@CurrentUser() user: AuthenticatedUser, @Param('orgId') orgId: string) {
    return this.organizations.get(this.scope(user), orgId);
  }

  @Delete(':orgId')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('orgId') orgId: string) {
    await this.organizations.remove(this.scope(user), orgId);
    return { success: true };
  }

  @Get(':orgId/members')
  listMembers(@CurrentUser() user: AuthenticatedUser, @Param('orgId') orgId: string) {
    return this.organizations.listMembers(this.scope(user), orgId);
  }

  @Post(':orgId/members')
  upsertMember(@CurrentUser() user: AuthenticatedUser, @Param('orgId') orgId: string, @Body() dto: UpsertMembershipDto) {
    return this.organizations.upsertMember(this.scope(user), orgId, dto);
  }

  @Delete(':orgId/members/:userId')
  async removeMember(@CurrentUser() user: AuthenticatedUser, @Param('orgId') orgId: string, @Param('userId') userId: string) {
    await this.organizations.removeMember(this.scope(user), orgId, userId);
    return { success: true };
  }

  @Get(':orgId/roles')
  listRoles(@CurrentUser() user: AuthenticatedUser, @Param('orgId') orgId: string) {
    return this.organizations.listRoles(this.scope(user), orgId);
  }

  @Post(':orgId/roles')
  createRole(@CurrentUser() user: AuthenticatedUser, @Param('orgId') orgId: string, @Body() dto: CreateRoleDto) {
    return this.organizations.createRole(this.scope(user), orgId, dto);
  }

  // eslint-disable-next-line max-params -- NestJS route handler (parameters are @Body/@Req/@Res/@Param/@Query)
  @Put(':orgId/roles/:slug')
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orgId') orgId: string,
    @Param('slug') slug: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.organizations.updateRole(this.scope(user), orgId, { slug, ...dto });
  }
}
