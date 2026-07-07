import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SsfEmitterService } from '../ssf/ssf-emitter.service';
import { CAEP_EVENTS } from '../ssf/caep-event-types';

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly ssf?: SsfEmitterService,
  ) {}

  /**
   * Get active (non-expired, non-revoked) sessions for user
   */
  async getActiveSessions(userId: string): Promise<any[]> {
    const tokens = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });

    return tokens.map((token) => ({
      id: token.id,
      clientName: token.client?.name,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
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
   * Revoke all sessions for user
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
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
