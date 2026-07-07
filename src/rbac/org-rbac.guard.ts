import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacService } from './rbac.service';
import { REQUIRE_PERMISSIONS_KEY } from './require-permissions.decorator';
import { hasPermission } from './permissions';
import { resolveAdminScope } from '../admin/admin-scope';

/**
 * Enforces @RequirePermissions on a route. After JWT auth:
 *   - superadmin (and admin-scoped machine tokens) bypass RBAC;
 *   - otherwise resolve the org context (route :orgId → X-Org-Id header →
 *     token org_id claim) and check the user's effective permissions.
 */
@Injectable()
export class OrgRbacGuard extends JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authed = await super.canActivate(context);
    if (!authed) return false;

    const required =
      this.reflector.getAllAndOverride<string[]>(REQUIRE_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const scope = resolveAdminScope(user);
    if (scope?.kind === 'superadmin') return true;
    if (user?.kind === 'machine') {
      if (scope) return true;
      throw new ForbiddenException('insufficient scope');
    }

    const orgId = this.resolveOrgId(request, user);
    if (!orgId) throw new ForbiddenException('organization context required');
    const granted = await this.rbac.resolvePermissions(user.userId, orgId);
    if (!required.every((p) => hasPermission(granted, p))) {
      throw new ForbiddenException('insufficient permissions');
    }
    return true;
  }

  private resolveOrgId(request: any, user: any): string | null {
    return request.params?.orgId ?? request.headers?.['x-org-id'] ?? user?.org_id ?? null;
  }
}
