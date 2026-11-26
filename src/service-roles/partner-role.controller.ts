import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpException,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PartnerRoleGuard } from './partner-role.guard';
import { PartnerRoleService } from './partner-role.service';
import {
  type PartnerRoleCaller,
  type PartnerRoleView,
  PartnerRoleRefusal,
  parsePartnerRoleInput,
} from './partner-role';

/** A refusal in the service's words: {error, error_description, code}. */
function httpOf(err: unknown): unknown {
  if (!(err instanceof PartnerRoleRefusal)) return err;
  const body = { error: err.code, error_description: err.message, code: err.code };
  if (err.status === 404) return new NotFoundException(body);
  if (err.status === 409) return new ConflictException(body);
  return new BadRequestException(body);
}

/**
 * The partner role door (rules in partner-role.ts): a product's backend puts
 * `partner` and `partner:<code>` on a person's account, or takes them off,
 * without the superadmin roles API. Machine callers only (PartnerRoleGuard).
 * A partner is approved by a person, one at a time: the limit is tighter
 * than the storefront backfill's.
 */
@ApiTags('service')
@ApiBearerAuth()
@Controller({ path: 'service/users', version: '1' })
@UseGuards(PartnerRoleGuard)
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class PartnerRoleController {
  constructor(private readonly roles: PartnerRoleService) {}

  @Post('partner-role')
  @HttpCode(200)
  async apply(
    @Req() req: Request & { partnerCaller: PartnerRoleCaller },
    @Body() body: unknown,
  ): Promise<PartnerRoleView> {
    try {
      return await this.roles.apply(req.partnerCaller, parsePartnerRoleInput(body));
    } catch (err) {
      throw httpOf(err) as HttpException;
    }
  }
}
