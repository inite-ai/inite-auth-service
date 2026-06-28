import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminService } from './admin.service';
import { OAuthAuditService } from '../audit/oauth-audit.service';
import { resolveAdminScope, applyScopeFilter } from './admin-scope';
import { AuditLogQuery } from './dto/audit-log-query';

/** Pulls IP + UA off an admin request for audit-log enrichment. */
function adminContext(req: Request): {
  ip: string;
  userAgent: string;
  operatorSub: string | null;
} {
  const fwd = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
  const ip = fwd.split(',')[0]?.trim() || req.ip || '';
  const operatorSub = (req as any).user?.userId ?? (req as any).user?.sub ?? null;
  return {
    ip,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? '',
    operatorSub,
  };
}

@Controller({ path: 'admin', version: '1' })
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly audit: OAuthAuditService,
  ) {}

  // ==================== Dashboard Stats ====================

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  // ==================== Users Management ====================

  @Get('users')
  async getAllUsers(@Query('page') page = '1', @Query('limit') limit = '50') {
    return this.adminService.getAllUsers(parseInt(page), parseInt(limit));
  }

  @Get('users/:userId')
  async getUserById(@Param('userId') userId: string) {
    return this.adminService.getUserById(userId);
  }

  @Put('users/:userId')
  async updateUser(
    @Param('userId') userId: string,
    @Body()
    body: Partial<{
      name: string;
      email: string;
      emailVerified: boolean;
      bio: string;
      location: string;
      profession: string;
      metadata: Record<string, any>;
    }>,
  ) {
    return this.adminService.updateUser(userId, body);
  }

  @Put('users/:userId/roles')
  async updateUserRoles(
    @Param('userId') userId: string,
    @Body() body: { roles: string[] },
  ) {
    return this.adminService.updateUserRoles(userId, body.roles);
  }

  @Delete('users/:userId')
  async deleteUser(@Param('userId') userId: string) {
    return this.adminService.deleteUser(userId);
  }

  /**
   * Emergency session kill: revoke every refresh token for the user
   * + 24h lockout + best-effort back-channel logout fan-out. Use for
   * compromise / lost-device incident response. Active access tokens
   * live until their (short) expiry; nothing past that.
   */
  @Post('users/:userId/revoke-sessions')
  async revokeUserSessions(
    @Param('userId') userId: string,
    @Body() body: { reason?: string; lockoutHours?: number } = {},
  ) {
    return this.adminService.revokeAllUserSessions(userId, body);
  }

  // ==================== OAuth Clients Management ====================

  @Get('oauth-clients')
  async getAllOAuthClients() {
    return this.adminService.getAllOAuthClients();
  }

  @Get('oauth-clients/:clientId')
  async getOAuthClientById(@Param('clientId') clientId: string) {
    return this.adminService.getOAuthClientById(clientId);
  }

  @Post('oauth-clients')
  async createOAuthClient(
    @Body()
    body: {
      name: string;
      clientId: string;
      clientSecret: string;
      redirectUris: string[];
      allowedScopes?: string[];
      allowedGrants?: string[];
      companyId?: string | null;
      allowedAudiences?: string[];
    },
    @Req() req: Request,
  ) {
    const result = await this.adminService.createOAuthClient(body);
    const ctx = adminContext(req);
    await this.audit.record({
      event: 'client.created',
      clientId: body.clientId,
      sub: ctx.operatorSub,
      scopes: body.allowedScopes ?? [],
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      success: true,
      metadata: {
        grants: body.allowedGrants,
        audiences: body.allowedAudiences,
        companyId: body.companyId,
      },
    });
    return result;
  }

  @Put('oauth-clients/:clientId')
  async updateOAuthClient(
    @Param('clientId') clientId: string,
    @Body()
    body: Partial<{
      name: string;
      redirectUris: string[];
      allowedScopes: string[];
      allowedGrants: string[];
      companyId: string | null;
      allowedAudiences: string[];
      active: boolean;
      logoUrl: string;
      privacyPolicyUrl: string;
      termsOfServiceUrl: string;
    }>,
    @Req() req: Request,
  ) {
    const result = await this.adminService.updateOAuthClient(clientId, body);
    const ctx = adminContext(req);
    await this.audit.record({
      event:
        body.active === false ? 'client.deactivated' : 'client.updated',
      clientId,
      sub: ctx.operatorSub,
      scopes: body.allowedScopes,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      success: result !== null,
      metadata: { changedFields: Object.keys(body) },
    });
    return result;
  }

  @Post('oauth-clients/:clientId/rotate-secret')
  async rotateClientSecret(
    @Param('clientId') clientId: string,
    @Body() body: { graceWindowSeconds?: number; force?: boolean } = {},
    @Req() req: Request,
  ) {
    const result = await this.adminService.rotateClientSecret(clientId, {
      graceWindowSeconds: body.graceWindowSeconds,
      force: body.force,
    });
    const ctx = adminContext(req);
    await this.audit.record({
      event: 'client.secret_rotated',
      clientId,
      sub: ctx.operatorSub,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      success: result !== null,
      metadata: {
        force: !!body.force,
        graceWindowSeconds: result?.graceWindowSeconds ?? null,
      },
    });
    return result;
  }

  // ==================== Audit log ====================

  /**
   * Tenant-scoped read of the OAuth audit log.
   *
   * Superadmin sees all rows. Scoped admins (operator JWT carries
   * `metadata.companyId`) see only their tenant — even if they pass
   * a different `companyId` query param, it gets overwritten by the
   * scope, so URL tampering can't widen visibility.
   */
  @Get('audit-log')
  async getAuditLog(@Query() q: AuditLogQuery, @Req() req: Request) {
    const scope = resolveAdminScope((req as any).user);
    if (!scope) throw new ForbiddenException('Admin access required');

    // Build filters. Note that companyId is overwritten by
    // applyScopeFilter when the operator is scoped — a scoped admin
    // cannot read another tenant's log by passing ?companyId=X.
    const filters: any = {
      clientId: q.clientId,
      event: q.event,
      success: q.success === undefined ? undefined : q.success === 'true',
      since: q.since ? new Date(q.since) : undefined,
      until: q.until ? new Date(q.until) : undefined,
      page: parseInt(q.page ?? '1', 10),
      limit: parseInt(q.limit ?? '50', 10),
    };
    if (scope.kind === 'superadmin' && q.companyId) {
      filters.companyId = q.companyId;
    }
    applyScopeFilter(scope, filters);

    return this.audit.list(filters);
  }

  @Delete('oauth-clients/:clientId')
  async deleteOAuthClient(
    @Param('clientId') clientId: string,
    @Req() req: Request,
  ) {
    const result = await this.adminService.deleteOAuthClient(clientId);
    const ctx = adminContext(req);
    await this.audit.record({
      event: 'client.deleted',
      clientId,
      sub: ctx.operatorSub,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      success: true,
    });
    return result;
  }
}

