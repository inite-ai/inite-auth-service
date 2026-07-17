/**
 * Admin API for long-lived opaque API keys ("ik_…") that verticals verify
 * via RFC 7662 introspection.
 *
 * Tenant scoping mirrors the rest of the admin surface: a superadmin
 * operates across tenants, a scoped admin (operator token carries
 * metadata.companyId) is pinned to their tenant on every route — list,
 * create and revoke alike — so URL/body tampering can't cross tenants.
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { OAuthAuditService } from '../audit/oauth-audit.service';
import { ApiKeysService } from '../oauth/api-keys.service';
import { AdminScope, resolveAdminScope } from './admin-scope';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('admin')
@Controller({ path: 'admin/api-keys', version: '1' })
@UseGuards(AdminGuard)
export class ApiKeysAdminController {
  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly audit: OAuthAuditService,
  ) {}

  @Get()
  list(@Query('companyId') companyId: string | undefined, @Req() req: Request) {
    const scope = this.requireScope(req);
    return this.apiKeys.list(this.effectiveCompanyId(scope, companyId));
  }

  @Post()
  async create(@Body() dto: CreateApiKeyDto, @Req() req: Request) {
    const scope = this.requireScope(req);
    const companyId = this.effectiveCompanyId(scope, dto.companyId);
    if (!companyId) {
      throw new ForbiddenException('companyId is required');
    }

    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 86_400_000)
      : undefined;
    const result = await this.apiKeys.issue({
      name: dto.name,
      companyId,
      audience: dto.audience,
      scopes: dto.scopes,
      policyNames: dto.policyNames,
      userId: dto.userId,
      expiresAt,
    });

    await this.audit.record({
      event: 'api_key.created',
      clientId: null,
      sub: operatorSub(req),
      scopes: dto.scopes,
      ip: requestIp(req),
      userAgent: (req.headers['user-agent'] as string | undefined) ?? '',
      success: true,
      metadata: {
        apiKeyId: result.apiKey.id,
        companyId,
        audience: dto.audience,
        expiresAt: expiresAt?.toISOString() ?? null,
      },
    });
    return result;
  }

  @Post(':id/revoke')
  async revoke(@Param('id') id: string, @Req() req: Request) {
    const scope = this.requireScope(req);
    const revoked = await this.apiKeys.revoke(
      id,
      scope.kind === 'scoped' ? scope.companyId : undefined,
    );

    await this.audit.record({
      event: 'api_key.revoked',
      clientId: null,
      sub: operatorSub(req),
      ip: requestIp(req),
      userAgent: (req.headers['user-agent'] as string | undefined) ?? '',
      success: true,
      metadata: { apiKeyId: id },
    });
    return revoked;
  }

  private requireScope(req: Request): AdminScope {
    const scope = resolveAdminScope(
      (req as Request & { user?: AuthenticatedUser }).user,
    );
    if (!scope) throw new ForbiddenException('Admin access required');
    return scope;
  }

  /** Scoped admins are pinned to their tenant; superadmins may pass any. */
  private effectiveCompanyId(
    scope: AdminScope,
    requested: string | undefined,
  ): string | undefined {
    return scope.kind === 'scoped' ? scope.companyId : requested || undefined;
  }
}

/** A stable identifier for the acting admin, for the audit trail. */
function operatorSub(req: Request): string | null {
  const user = (req as Request & { user?: AuthenticatedUser }).user;
  const principal = user as { did?: string; userId?: string; sub?: string } | undefined;
  return principal?.did ?? principal?.userId ?? principal?.sub ?? null;
}

function requestIp(req: Request): string {
  const fwd = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
  return fwd.split(',')[0]?.trim() || req.ip || '';
}
