import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ORGS_SCOPE, type LaneCaller } from './storefront-orgs';

/** The token's own client_id: the bearer was verified by the JWT guard just before. */
export function tokenClientId(authorization: string | undefined): string | null {
  const jwt = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1];
  const payload = jwt?.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      client_id?: unknown;
    };
    return typeof claims.client_id === 'string' ? claims.client_id : null;
  } catch {
    return null;
  }
}

const refuse = (code: string, description: string) =>
  new ForbiddenException({ error: code, error_description: description, code });

/**
 * Rule 1 of storefront-orgs.ts: a machine token with customer-lane:orgs, from
 * an active customerLane client that has a prefix. The caller is the token's
 * client_id (not its audience), looked up fresh, so a client switched off in
 * auth stops at once. Sets req.laneCaller for the controller.
 */
@Injectable()
export class StorefrontOrgsGuard extends JwtAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await super.canActivate(context))) return false;
    const req = context
      .switchToHttp()
      .getRequest<
        Request & { user?: { kind?: string; scope?: unknown }; laneCaller?: LaneCaller }
      >();
    if (req.user?.kind !== 'machine')
      throw refuse('insufficient_scope', 'A machine (client_credentials) token is required');
    const scope = req.user.scope instanceof Set ? req.user.scope : new Set<string>();
    if (!scope.has(ORGS_SCOPE)) throw refuse('insufficient_scope', `${ORGS_SCOPE} scope required`);

    const clientId = tokenClientId(req.headers.authorization);
    const client = clientId
      ? await this.prisma.oAuthClient.findUnique({
          where: { clientId },
          select: { clientId: true, active: true, customerLane: true, customerLanePrefix: true },
        })
      : null;
    if (!client?.active || !client.customerLane || !client.customerLanePrefix) {
      throw refuse('unauthorized_client', 'This client does not keep storefront organizations');
    }
    req.laneCaller = { clientId: client.clientId, prefix: client.customerLanePrefix };
    return true;
  }
}
