import {
  Controller,
  Get,
  Req,
  Header,
  UseGuards,
  UseFilters,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { ScimGuard } from './scim.guard';
import { ScimExceptionFilter } from './scim-exception.filter';
import { SCIM_CONTENT_TYPE } from './scim.contracts';
import { scimBaseUrl } from './scim-support';
import { serviceProviderConfig, resourceTypes, schemas } from './scim-discovery';

/**
 * SCIM 2.0 discovery (RFC 7644 §4) at /scim/v2 — ServiceProviderConfig,
 * ResourceTypes, and Schemas so a provisioning client can auto-configure. Gated
 * by the same ScimGuard (SCIM_ENABLED + read scope) as the resource endpoints.
 */
@ApiTags('scim')
@ApiBearerAuth('access-token')
@UseGuards(ScimGuard)
@UseFilters(ScimExceptionFilter)
@Controller({ path: 'scim/v2', version: VERSION_NEUTRAL })
export class ScimDiscoveryController {
  @Get('ServiceProviderConfig')
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  serviceProviderConfig(@Req() req: Request) {
    return serviceProviderConfig(scimBaseUrl(req));
  }

  @Get('ResourceTypes')
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  resourceTypes(@Req() req: Request) {
    return resourceTypes(scimBaseUrl(req));
  }

  @Get('Schemas')
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  schemas() {
    return schemas();
  }
}
