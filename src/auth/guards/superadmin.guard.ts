import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import type { AuthenticatedUser } from '../authenticated-user';
import { resolveAdminScope } from '../../admin/admin-scope';

/**
 * Superadmin-only gate. Extends AdminGuard (authenticate + admin), then
 * additionally requires the principal to resolve to a `superadmin` scope —
 * i.e. an untenanted operator, not a company-scoped admin.
 *
 * Use for globally-shared resources (federation connectors, system clients)
 * where a tenant admin must not repoint config the whole platform relies on.
 * Replaces per-route inline `assertSuperadmin(user)` checks so the guarantee
 * lives on the route metadata, not scattered method bodies.
 */
@Injectable()
export class SuperadminGuard extends AdminGuard implements CanActivate {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const isAdmin = await super.canActivate(context);
    if (!isAdmin) {
      return false;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const scope = request.user ? resolveAdminScope(request.user) : null;
    if (!scope || scope.kind !== 'superadmin') {
      throw new ForbiddenException('superadmin access required');
    }

    return true;
  }
}
