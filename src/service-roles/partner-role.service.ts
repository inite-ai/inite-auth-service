import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthAuditService } from '../audit/oauth-audit.service';
import {
  PARTNER_ROLE_SCOPE,
  type PartnerRoleCaller,
  type PartnerRoleInput,
  type PartnerRoleView,
  PartnerRoleRefusal,
  partnerRolesOf,
  rolesAfter,
  sameRoles,
  storedRoles,
} from './partner-role';

const USER_SELECT = { id: true, did: true, metadata: true, updatedAt: true } as const;
/** A concurrent write to the same row moved updatedAt: read again, this many times. */
const ATTEMPTS = 3;

type UserRow = { id: string; did: string | null; metadata: unknown; updatedAt: Date };

/**
 * The database side of the partner role door (rules in partner-role.ts).
 * Writes users.metadata.roles of one account and nothing else.
 */
@Injectable()
export class PartnerRoleService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly audit?: OAuthAuditService,
  ) {}

  async apply(caller: PartnerRoleCaller, input: PartnerRoleInput): Promise<PartnerRoleView> {
    try {
      for (let attempt = 1; ; attempt++) {
        const user = await this.findByEmail(input.email);
        const before = storedRoles(user.metadata);
        const after = rolesAfter(before, input.code, input.action);
        const changed = !sameRoles(before, after);
        if (changed && !(await this.write(user, after))) {
          if (attempt < ATTEMPTS) continue;
          throw new PartnerRoleRefusal(409, 'conflict', 'The account changed meanwhile; try again');
        }
        await this.record(caller, input, { sub: user.did, changed });
        return { userId: user.id, roles: partnerRolesOf(after), changed };
      }
    } catch (err) {
      if (err instanceof PartnerRoleRefusal)
        await this.record(caller, input, { refused: err.code });
      throw err;
    }
  }

  /** Rule 2: one account with this verified address, case-insensitive. */
  private async findByEmail(email: string): Promise<UserRow> {
    const rows = await this.prisma.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' }, emailVerified: true },
      select: USER_SELECT,
      take: 2,
    });
    if (rows.length === 0) {
      throw new PartnerRoleRefusal(404, 'no-account', 'No account has this verified email');
    }
    if (rows.length > 1) {
      throw new PartnerRoleRefusal(
        409,
        'ambiguous-account',
        'More than one account has this email',
      );
    }
    return rows[0]!;
  }

  /**
   * Rule 4: metadata.roles only, every other key kept. Conditional on the
   * row's updatedAt, so a write that raced this one (an admin edit, another
   * grant) is never overwritten with a stale copy of the metadata.
   */
  private async write(user: UserRow, roles: string[]): Promise<boolean> {
    const metadata =
      user.metadata && typeof user.metadata === 'object' && !Array.isArray(user.metadata)
        ? (user.metadata as Record<string, unknown>)
        : {};
    const res = await this.prisma.user.updateMany({
      where: { id: user.id, updatedAt: user.updatedAt },
      data: { metadata: { ...metadata, roles } as Prisma.InputJsonValue },
    });
    return res.count === 1;
  }

  /** One audit row per call: success without `refused`, else the refusal code. No email in it. */
  private record(
    caller: PartnerRoleCaller,
    input: PartnerRoleInput,
    outcome: { sub?: string | null; changed?: boolean; refused?: string },
  ) {
    return (
      this.audit?.record({
        event: 'service.user.partner_role',
        clientId: caller.clientId,
        sub: outcome.sub ?? null,
        scopes: [PARTNER_ROLE_SCOPE],
        success: !outcome.refused,
        errorMessage: outcome.refused ?? null,
        metadata: {
          action: input.action,
          code: input.code,
          ...(outcome.changed === undefined ? {} : { changed: outcome.changed }),
        },
      }) ?? Promise.resolve()
    );
  }
}
