import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Header,
  HttpCode,
  UseGuards,
  UseFilters,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { ScimGuard } from './scim.guard';
import { ScimExceptionFilter } from './scim-exception.filter';
import { ScimGroupsService } from './scim-groups.service';
import { ScimGroupBody, ScimPatchBody, SCIM_CONTENT_TYPE } from './scim.contracts';
import { resolveScimTenant, scimBaseUrl, ScimPrincipal } from './scim-support';

/**
 * SCIM 2.0 Groups endpoint (RFC 7644) at /scim/v2/Groups. A group maps to a
 * tenant OrgRole; members are the users whose Membership.role is that slug.
 */
@ApiTags('scim')
@ApiBearerAuth('access-token')
@UseGuards(ScimGuard)
@UseFilters(ScimExceptionFilter)
@Controller({ path: 'scim/v2', version: VERSION_NEUTRAL })
export class ScimGroupsController {
  constructor(private readonly groups: ScimGroupsService) {}

  @Post('Groups')
  @HttpCode(201)
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  createGroup(@Body() body: ScimGroupBody, @Req() req: Request) {
    return this.groups.createGroup(this.tenant(req), body, scimBaseUrl(req));
  }

  @Get('Groups')
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  listGroups(
    @Query() query: { filter?: string; startIndex?: string; count?: string },
    @Req() req: Request,
  ) {
    return this.groups.listGroups(this.tenant(req), query, scimBaseUrl(req));
  }

  @Get('Groups/:id')
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  getGroup(@Param('id') id: string, @Req() req: Request) {
    return this.groups.getGroup(this.tenant(req), id, scimBaseUrl(req));
  }

  @Put('Groups/:id')
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  replaceGroup(@Param('id') id: string, @Body() body: ScimGroupBody, @Req() req: Request) {
    return this.groups.replaceGroup({ companyId: this.tenant(req), id, body, baseUrl: scimBaseUrl(req) });
  }

  @Patch('Groups/:id')
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  patchGroup(@Param('id') id: string, @Body() body: ScimPatchBody, @Req() req: Request) {
    return this.groups.patchGroup({
      companyId: this.tenant(req),
      id,
      operations: body.Operations,
      baseUrl: scimBaseUrl(req),
    });
  }

  @Delete('Groups/:id')
  @HttpCode(204)
  async deleteGroup(@Param('id') id: string, @Req() req: Request) {
    await this.groups.deleteGroup(this.tenant(req), id);
  }

  private tenant(req: Request): string {
    return resolveScimTenant(req.user as ScimPrincipal | undefined);
  }
}
