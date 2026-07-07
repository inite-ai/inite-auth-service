import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Client-assertion jti rows only need to outlive the assertion they guard
 * (capped at 5 min). This reaper deletes expired rows hourly so the replay
 * table stays small. Mirrors DcrReaperService.
 */
@Injectable()
export class ClientAssertionJtiReaperService {
  private readonly logger = new Logger(ClientAssertionJtiReaperService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async reapExpired(): Promise<void> {
    const result = await this.prisma.clientAssertionJti.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      this.logger.log(`Reaped ${result.count} expired client-assertion jti row(s)`);
    }
  }
}
