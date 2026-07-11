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
import { ScimUsersService } from './scim-users.service';
import { ScimUserBody, ScimPatchBody, SCIM_CONTENT_TYPE } from './scim.contracts';
import { resolveScimTenant, scimBaseUrl, ScimPrincipal } from './scim-support';

/**
 * SCIM 2.0 Users endpoint (RFC 7644) at /scim/v2/Users — version-neutral
 * because the /scim/v2 path is fixed by the spec, not our /v1 versioning.
 * Every operation is tenant-scoped to the caller's company via the M2M token.
 */
@ApiTags('scim')
@ApiBearerAuth('access-token')
@UseGuards(ScimGuard)
@UseFilters(ScimExceptionFilter)
@Controller({ path: 'scim/v2', version: VERSION_NEUTRAL })
export class ScimUsersController {
  constructor(private readonly users: ScimUsersService) {}

  @Post('Users')
  @HttpCode(201)
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  createUser(@Body() body: ScimUserBody, @Req() req: Request) {
    return this.users.createUser(this.tenant(req), body, scimBaseUrl(req));
  }

  @Get('Users')
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  listUsers(
    @Query() query: { filter?: string; startIndex?: string; count?: string },
    @Req() req: Request,
  ) {
    return this.users.listUsers(this.tenant(req), query, scimBaseUrl(req));
  }

  @Get('Users/:id')
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  getUser(@Param('id') id: string, @Req() req: Request) {
    return this.users.getUser(this.tenant(req), id, scimBaseUrl(req));
  }

  @Put('Users/:id')
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  replaceUser(@Param('id') id: string, @Body() body: ScimUserBody, @Req() req: Request) {
    return this.users.replaceUser({
      companyId: this.tenant(req),
      id,
      body,
      baseUrl: scimBaseUrl(req),
    });
  }

  @Patch('Users/:id')
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  patchUser(@Param('id') id: string, @Body() body: ScimPatchBody, @Req() req: Request) {
    return this.users.patchUser({
      companyId: this.tenant(req),
      id,
      operations: body.Operations,
      baseUrl: scimBaseUrl(req),
    });
  }

  @Delete('Users/:id')
  @HttpCode(204)
  async deleteUser(@Param('id') id: string, @Req() req: Request) {
    await this.users.deactivateUser(this.tenant(req), id);
  }

  private tenant(req: Request): string {
    return resolveScimTenant(req.user as ScimPrincipal | undefined);
  }
}
