import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from '../database/entities';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  /**
   * Get active sessions for user
   */
  async getActiveSessions(userId: string): Promise<any[]> {
    const tokens = await this.refreshTokenRepository.find({
      where: { userId, revoked: false },
      relations: ['client'],
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
    const token = await this.refreshTokenRepository.findOne({
      where: { id: sessionId, userId },
    });

    if (token) {
      token.revoked = true;
      token.revokedAt = new Date();
      await this.refreshTokenRepository.save(token);
    }
  }

  /**
   * Revoke all sessions for user
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revoked: false },
      { revoked: true, revokedAt: new Date() },
    );
  }
}

