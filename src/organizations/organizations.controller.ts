import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { resolveAdminScope, AdminScope } from '../admin/admin-scope';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpsertMembershipDto } from './dto/upsert-membership.dto';
import { CreateRoleDto } from './dto/create-role.dto';

/**
 * Admin API for organizations, memberships, and custom roles. Tenant-scoped:
 * a company-scoped admin only sees/edits its own organization.
 */
@ApiTags('admin')
@Controller({ path: 'admin/organizations', version: '1' })
@UseGuards(AdminGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  private scope(req: any): AdminScope {
    const scope = resolveAdminScope(req.user);
    if (!scope) throw new ForbiddenException('admin access required');
    return scope;
  }

  @Get()
  list(@Req() req: any) {
    return this.organizations.list(this.scope(req));
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateOrganizationDto) {
    return this.organizations.create(this.scope(req), dto);
  }

  @Get(':orgId')
  get(@Req() req: any, @Param('orgId') orgId: string) {
    return this.organizations.get(this.scope(req), orgId);
  }

  @Delete(':orgId')
  async remove(@Req() req: any, @Param('orgId') orgId: string) {
    await this.organizations.remove(this.scope(req), orgId);
    return { success: true };
  }

  @Get(':orgId/members')
  listMembers(@Req() req: any, @Param('orgId') orgId: string) {
    return this.organizations.listMembers(this.scope(req), orgId);
  }

  @Post(':orgId/members')
  upsertMember(@Req() req: any, @Param('orgId') orgId: string, @Body() dto: UpsertMembershipDto) {
    return this.organizations.upsertMember(this.scope(req), orgId, dto);
  }

  @Delete(':orgId/members/:userId')
  async removeMember(@Req() req: any, @Param('orgId') orgId: string, @Param('userId') userId: string) {
    await this.organizations.removeMember(this.scope(req), orgId, userId);
    return { success: true };
  }

  @Get(':orgId/roles')
  listRoles(@Req() req: any, @Param('orgId') orgId: string) {
    return this.organizations.listRoles(this.scope(req), orgId);
  }

  @Post(':orgId/roles')
  createRole(@Req() req: any, @Param('orgId') orgId: string, @Body() dto: CreateRoleDto) {
    return this.organizations.createRole(this.scope(req), orgId, dto);
  }
}
