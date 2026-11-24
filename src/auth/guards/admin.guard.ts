import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import type {
  AuthenticatedUser,
  MachinePrincipal,
  UserPrincipal,
} from '../authenticated-user';
import { adminTier } from '../../admin/admin-scope';

/**
 * Admit two distinct principals to admin endpoints:
 *
 *   1. **User** who is a superadmin (the explicit role) or the admin of one
 *      company. An admin with neither is refused. Path used by the admin
 *      UI in browser.
 *
 *   2. **Machine** (M2M token via `client_credentials`) whose JWT
 *      `scope` claim contains `'admin'`. Path used by `@inite/auth-admin`
 *      tools, automation, MCP integrations.
 *
 * The principal kind is set by JwtStrategy.validate(): `kind: 'user'`
 * or `kind: 'machine'`. resolveAdminScope() reads the same shapes to
 * derive the tenant filter for downstream queries.
 */
@Injectable()
export class AdminGuard extends JwtAuthGuard implements CanActivate {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const isAuthenticated = await super.canActivate(context);
    if (!isAuthenticated) {
      return false;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (user?.kind === 'machine') {
      return this.assertMachineAdmin(user);
    }

    return this.assertUserAdmin(user);
  }

  private assertMachineAdmin(user: MachinePrincipal): boolean {
    const scope = user.scope instanceof Set ? user.scope : new Set<string>();
    if (!scope.has('admin')) {
      throw new ForbiddenException('Admin scope required');
    }
    return true;
  }

  private assertUserAdmin(user: UserPrincipal | undefined): boolean {
    const tier = adminTier(user?.metadata);
    if (tier === 'unscoped') {
      throw new ForbiddenException(
        'This admin account has no company and no superadmin role, so it has no access here. ' +
          'A superadmin can give it either one.',
      );
    }
    if (!tier) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
