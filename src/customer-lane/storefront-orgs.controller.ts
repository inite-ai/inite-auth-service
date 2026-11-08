import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { StorefrontOrgsGuard } from './storefront-orgs.guard';
import { StorefrontOrgsService } from './storefront-orgs.service';
import { type LaneCaller, type OrgView, OrgRefusal, parseOrgInput } from './storefront-orgs';

/** A refusal in the service's words: {error, error_description, code}, the shape the kit reads. */
function httpOf(err: unknown): unknown {
  if (!(err instanceof OrgRefusal)) return err;
  const body = { error: err.code, error_description: err.message, code: err.code };
  if (err.status === 409) return new ConflictException(body);
  if (err.status === 403) return new ForbiddenException(body);
  return new BadRequestException(body);
}

/**
 * Storefront orgs (issue #304): a customer-lane product keeps its tenants'
 * orgs. Machine callers only (StorefrontOrgsGuard); a backfill walks a whole
 * catalogue, hence the roomier limit than a person's routes.
 */
@ApiTags('customer-lane')
@ApiBearerAuth()
@Controller({ path: 'customer-lane/orgs', version: '1' })
@UseGuards(StorefrontOrgsGuard)
@Throttle({ default: { limit: 300, ttl: 60000 } })
export class StorefrontOrgsController {
  constructor(private readonly orgs: StorefrontOrgsService) {}

  @Put(':slug')
  async upsert(
    @Req() req: Request & { laneCaller: LaneCaller },
    @Param('slug') slug: string,
    @Body() body: unknown,
  ): Promise<OrgView> {
    try {
      return await this.orgs.upsert(req.laneCaller, slug.trim().toLowerCase(), parseOrgInput(body));
    } catch (err) {
      throw httpOf(err) as HttpException;
    }
  }

  @Get()
  async list(@Req() req: Request & { laneCaller: LaneCaller }): Promise<{ orgs: OrgView[] }> {
    return { orgs: await this.orgs.list(req.laneCaller) };
  }
}
