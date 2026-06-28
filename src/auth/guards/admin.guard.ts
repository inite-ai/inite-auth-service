import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Admit two distinct principals to admin endpoints:
 *
 *   1. **User** with `metadata.isAdmin === true` or `metadata.roles`
 *      including `'admin'` / `'superadmin'`. Path used by the admin
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
  // eslint-disable-next-line complexity -- TODO(complexity): decompose this function
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isAuthenticated = await super.canActivate(context);
    if (!isAuthenticated) {
      return false;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user?.kind === 'machine') {
      const scope = user.scope instanceof Set ? user.scope : new Set<string>();
      if (!scope.has('admin')) {
        throw new ForbiddenException('Admin scope required');
      }
      return true;
    }

    const isAdmin =
      user?.metadata?.isAdmin === true ||
      user?.metadata?.roles?.includes('admin') ||
      user?.metadata?.roles?.includes('superadmin');

    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}





