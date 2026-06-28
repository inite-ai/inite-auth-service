import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

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
    await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId },
      data: { revoked: true, revokedAt: new Date() },
    });
  }

  /**
   * Revoke all sessions for user
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
  }
}
