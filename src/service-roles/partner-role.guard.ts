import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { tokenClientId } from '../customer-lane/storefront-orgs.guard';
import { PARTNER_ROLE_SCOPE, type PartnerRoleCaller } from './partner-role';

const refuse = (code: string, description: string) =>
  new ForbiddenException({ error: code, error_description: description, code });

/**
 * Rule 1 of partner-role.ts: a machine token with roles:partner, from an
 * active client that still lists the scope. The client is looked up fresh,
 * so a client switched off, or the scope taken out of its manifest, stops
 * at once rather than when its last token expires. Sets req.partnerCaller.
 */
@Injectable()
export class PartnerRoleGuard extends JwtAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await super.canActivate(context))) return false;
    const req = context
      .switchToHttp()
      .getRequest<
        Request & { user?: { kind?: string; scope?: unknown }; partnerCaller?: PartnerRoleCaller }
      >();
    if (req.user?.kind !== 'machine')
      throw refuse('insufficient_scope', 'A machine (client_credentials) token is required');
    const scope = req.user.scope instanceof Set ? req.user.scope : new Set<string>();
    if (!scope.has(PARTNER_ROLE_SCOPE))
      throw refuse('insufficient_scope', `${PARTNER_ROLE_SCOPE} scope required`);

    const clientId = tokenClientId(req.headers.authorization);
    const client = clientId
      ? await this.prisma.oAuthClient.findUnique({
          where: { clientId },
          select: { clientId: true, active: true, allowedScopes: true },
        })
      : null;
    if (!client?.active || !client.allowedScopes.includes(PARTNER_ROLE_SCOPE)) {
      throw refuse('unauthorized_client', 'This client may not change partner roles');
    }
    req.partnerCaller = { clientId: client.clientId };
    return true;
  }
}
