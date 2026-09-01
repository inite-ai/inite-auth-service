import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SsfEmitterService } from '../ssf/ssf-emitter.service';
import { CAEP_EVENTS } from '../ssf/caep-event-types';
import { requestContext } from '../common/request-context';

/** A user-visible active session, projected from a non-revoked refresh token. */
export interface ActiveSession {
  id: string;
  clientId: string;
  clientName: string;
  /** Space-delimited granted scopes, so the user sees what the app can do. */
  scope: string | null;
  createdAt: Date;
  expiresAt: Date;
  /** Null on rows minted before migration 0025. */
  lastUsedAt: Date | null;
  ip: string | null;
  userAgent: string | null;
  /**
   * Best-effort "you are here" marker. The account page authenticates with
   * an access token, so there is no refresh-token identity to match on —
   * we compare the issuing device fingerprint (IP + UA) with the caller's.
   * Approximate by construction, hence advisory-only in the UI.
   */
  isCurrentDevice: boolean;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly ssf?: SsfEmitterService,
  ) {}

  /**
   * Get active (non-expired, non-revoked) sessions for user
   */
  async getActiveSessions(userId: string): Promise<ActiveSession[]> {
    const tokens = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      include: { client: true },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const caller = requestContext.get();

    return tokens.map((token) => ({
      id: token.id,
      clientId: token.clientId,
      clientName: token.client?.name,
      scope: token.scope,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      lastUsedAt: token.lastUsedAt,
      ip: token.ip,
      userAgent: token.userAgent,
      isCurrentDevice:
        !!token.userAgent &&
        !!caller?.userAgent &&
        token.userAgent === caller.userAgent &&
        token.ip === (caller.ip || null),
    }));
  }

  /**
   * Revoke session
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const token = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId },
      select: { companyId: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId },
      data: { revoked: true, revokedAt: new Date() },
    });
    await this.signalSessionRevoked(userId, token?.companyId ?? null);
  }

  /**
   * Revoke all sessions for user.
   *
   * `exceptSessionId` backs the "sign out everywhere else" action — without
   * it the user has to log back in on the very device they just used to
   * secure the account, which is why the all-or-nothing version alone kept
   * getting avoided.
   */
  async revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revoked: false,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revoked: true, revokedAt: new Date() },
    });
    await this.signalSessionRevoked(userId, null);
  }

  /**
   * CAEP session-revoked signal (fire-and-forget) so subscribed receivers can
   * drop their local session immediately. No-op when SSF is not configured.
   */
  private async signalSessionRevoked(userId: string, companyId: string | null): Promise<void> {
    if (!this.ssf) return;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { did: true } });
    if (!user) return;
    await this.ssf.emit({
      eventType: CAEP_EVENTS.sessionRevoked,
      subject: user.did,
      companyId,
    });
  }
}
