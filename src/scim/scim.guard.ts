import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Guards the SCIM 2.0 surface. Three gates:
 *   1. `SCIM_ENABLED` — when off, the whole API 404s (no probing a disabled
 *      feature).
 *   2. Machine principal only — SCIM is machine-to-machine (client_credentials).
 *   3. Scope by HTTP method — reads need `scim:read`, mutations need
 *      `scim:write` (write implies read); an `admin`-scoped token satisfies both.
 */
@Injectable()
export class ScimGuard extends JwtAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.config.get<string>('SCIM_ENABLED') !== 'true') {
      throw new NotFoundException('SCIM API is not enabled');
    }
    if (!(await super.canActivate(context))) return false;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { kind?: string; scope?: unknown } }>();
    const user = request.user;
    if (user?.kind !== 'machine') {
      throw new ForbiddenException('SCIM requires a machine (client_credentials) token');
    }

    const scope = user.scope instanceof Set ? user.scope : new Set<string>();
    const isRead = request.method === 'GET' || request.method === 'HEAD';
    const ok = scope.has('admin')
      || scope.has('scim:write')
      || (isRead && scope.has('scim:read'));
    if (!ok) {
      throw new ForbiddenException(
        `${isRead ? 'scim:read' : 'scim:write'} scope required`,
      );
    }
    return true;
  }
}
