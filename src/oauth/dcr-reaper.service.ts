import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Stale, unused RFC 7591 dynamically-registered clients accumulate over
 * time — every unauthenticated caller that runs Dynamic Client
 * Registration leaves a `dcr_`-prefixed OAuthClient row behind. This
 * reaper deletes the ones that were registered but never actually used
 * (no RefreshToken ever minted for them) once they age past the cutoff.
 */
const DCR_MAX_AGE_DAYS = 30;
const DCR_CLIENT_PREFIX = 'dcr_';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class DcrReaperService {
  private readonly logger = new Logger(DcrReaperService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Delete `dcr_*` clients that are BOTH older than DCR_MAX_AGE_DAYS AND
   * never used (no RefreshToken row references their clientId). Only ever
   * targets the `dcr_` prefix, so operator-provisioned clients are safe.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async reapStaleClients(): Promise<void> {
    const cutoff = new Date(Date.now() - DCR_MAX_AGE_DAYS * MS_PER_DAY);
    const stale = await this.prisma.oAuthClient.findMany({
      where: {
        clientId: { startsWith: DCR_CLIENT_PREFIX },
        createdAt: { lt: cutoff },
      },
      select: { id: true, clientId: true },
    });
    if (stale.length === 0) {
      return;
    }

    const usedClientIds = await this.findUsedClientIds(
      stale.map((client) => client.clientId),
    );
    const reapableIds = stale
      .filter((client) => !usedClientIds.has(client.clientId))
      .map((client) => client.id);
    if (reapableIds.length === 0) {
      return;
    }

    await this.prisma.oAuthClient.deleteMany({
      where: { id: { in: reapableIds } },
    });
    this.logger.log(`Reaped ${reapableIds.length} stale unused DCR client(s)`);
  }

  /**
   * The set of clientIds (from the candidate list) that have at least one
   * RefreshToken — i.e. clients that were actually used. `clientId` on
   * RefreshToken is a plain string column, so this is a value match rather
   * than a relation traversal.
   */
  private async findUsedClientIds(clientIds: string[]): Promise<Set<string>> {
    const rows = await this.prisma.refreshToken.findMany({
      where: { clientId: { in: clientIds } },
      distinct: ['clientId'],
      select: { clientId: true },
    });
    return new Set(rows.map((row) => row.clientId));
  }
}
