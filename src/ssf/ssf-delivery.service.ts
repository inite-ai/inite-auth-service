import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SetPushService } from './set-push.service';

/**
 * Poll-based delivery (RFC 8936) and the push retry drain. Poll returns pending
 * SETs for a stream and acks the ones the receiver confirms; the cron drain
 * re-attempts failed push deliveries whose backoff has elapsed.
 */
@Injectable()
export class SsfDeliveryService {
  private readonly logger = new Logger(SsfDeliveryService.name);
  private static readonly MAX_ATTEMPTS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: SetPushService,
  ) {}

  /** RFC 8936: return pending SETs (keyed by jti) and ack the given jtis. */
  async poll(streamDbId: string, acks: string[], maxEvents: number): Promise<Record<string, string>> {
    if (acks.length > 0) {
      await this.prisma.setDelivery.updateMany({
        where: { streamId: streamDbId, jti: { in: acks } },
        data: { status: 'acked', deliveredAt: new Date() },
      });
    }
    const pending = await this.prisma.setDelivery.findMany({
      where: { streamId: streamDbId, status: { in: ['pending', 'failed'] } },
      take: Math.min(Math.max(maxEvents, 1), 100),
      orderBy: { createdAt: 'asc' },
    });
    const out: Record<string, string> = {};
    for (const d of pending) out[d.jti] = d.setJwt;
    return out;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async drainFailedPush(): Promise<void> {
    const due = await this.prisma.setDelivery.findMany({
      where: { status: 'failed', nextAttemptAt: { lte: new Date() }, attempts: { lt: SsfDeliveryService.MAX_ATTEMPTS } },
      include: { stream: true },
      take: 100,
    });
    for (const d of due) {
      if (d.stream.deliveryMethod !== 'push' || !d.stream.pushEndpointUrl) continue;
      await this.push.deliver({ deliveryId: d.id, url: d.stream.pushEndpointUrl, authHeader: d.stream.pushAuthHeader, setJwt: d.setJwt });
    }
    if (due.length > 0) this.logger.log(`Retried ${due.length} failed SET push(es)`);
  }
}
