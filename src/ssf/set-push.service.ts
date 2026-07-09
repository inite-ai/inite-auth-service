import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Pushes a Security Event Token to a stream's receiver (RFC 8935). Best-effort
 * and time-boxed — mirrors AuditWebhookService. Never throws; records delivery
 * status + attempt count on the SetDelivery row for the retry drain.
 */
@Injectable()
export class SetPushService {
  private readonly logger = new Logger(SetPushService.name);
  private static readonly TIMEOUT_MS = 3000;

  constructor(private readonly prisma: PrismaService) {}

  async deliver(input: {
    deliveryId: string;
    url: string;
    authHeader?: string | null;
    setJwt: string;
  }): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/secevent+jwt',
      Accept: 'application/json',
      'User-Agent': 'inite-auth-ssf-transmitter',
    };
    if (input.authHeader) headers.Authorization = input.authHeader;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SetPushService.TIMEOUT_MS);
    try {
      const res = await fetch(input.url, { method: 'POST', headers, body: input.setJwt, signal: controller.signal });
      if (res.ok) {
        await this.mark(input.deliveryId, { status: 'delivered', deliveredAt: new Date() });
      } else {
        await this.fail(input.deliveryId, `HTTP ${res.status}`);
      }
    } catch (err) {
      await this.fail(input.deliveryId, (err as Error)?.message ?? 'unknown');
    } finally {
      clearTimeout(timer);
    }
  }

  private async fail(deliveryId: string, error: string): Promise<void> {
    this.logger.warn(`SET push failed (${deliveryId}): ${error}`);
    // Exponential-ish backoff: retry in 60s * attempts (capped by the drain).
    await this.prisma.setDelivery.update({
      where: { id: deliveryId },
      data: { status: 'failed', lastError: error, attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 60_000) },
    }).catch((e) =>
      this.logger.warn(
        `SET delivery status write failed (${deliveryId}): ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
  }

  private async mark(deliveryId: string, data: Record<string, unknown>): Promise<void> {
    await this.prisma.setDelivery.update({ where: { id: deliveryId }, data }).catch((e) =>
      this.logger.warn(
        `SET delivery status write failed (${deliveryId}): ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
  }
}
