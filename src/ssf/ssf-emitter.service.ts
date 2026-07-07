import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetBuilderService } from './set-builder.service';
import { SetPushService } from './set-push.service';
import { SSF_VERIFICATION_EVENT } from './caep-event-types';

/**
 * Fan-out entry point for security events. Finds enabled streams in the
 * subject's tenant subscribing to the event type, mints one SET per stream,
 * queues a SetDelivery, and fires push delivery fire-and-forget. A no-op that
 * never throws when no streams match — so it can be called inline from auth
 * flows (session/token revocation, credential change) without adding risk.
 */
@Injectable()
export class SsfEmitterService {
  private readonly logger = new Logger(SsfEmitterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: SetBuilderService,
    private readonly push: SetPushService,
  ) {}

  async emit(input: {
    eventType: string;
    subject: string;
    companyId?: string | null;
    claims?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const streams = await this.prisma.ssfStream.findMany({
        where: {
          status: 'enabled',
          eventsRequested: { has: input.eventType },
          // A tenant event reaches global (companyId null) + same-tenant
          // streams; a tenant-less event reaches only global streams.
          ...(input.companyId
            ? { OR: [{ companyId: null }, { companyId: input.companyId }] }
            : { companyId: null }),
        },
      });
      for (const stream of streams) {
        await this.emitToStream(stream, input);
      }
    } catch (err) {
      this.logger.warn(`SSF emit failed for ${input.eventType}: ${(err as Error)?.message}`);
    }
  }

  /** SSF verification — deliver a verification SET to one specific stream. */
  async verify(stream: {
    id: string; streamId: string; deliveryMethod: string; pushEndpointUrl: string | null; pushAuthHeader: string | null; aud: string[];
  }): Promise<void> {
    await this.emitToStream(stream, {
      eventType: SSF_VERIFICATION_EVENT,
      subject: stream.streamId,
      claims: { state: 'ok' },
    });
  }

  private async emitToStream(
    stream: { id: string; deliveryMethod: string; pushEndpointUrl: string | null; pushAuthHeader: string | null; aud: string[] },
    input: { eventType: string; subject: string; claims?: Record<string, unknown> },
  ): Promise<void> {
    const set = await this.builder.build({
      eventType: input.eventType,
      subject: input.subject,
      audience: stream.aud,
      claims: input.claims,
    });
    if (!set) return;

    const delivery = await this.prisma.setDelivery.create({
      data: { streamId: stream.id, jti: set.jti, eventType: input.eventType, sub: input.subject, setJwt: set.jwt },
    });

    if (stream.deliveryMethod === 'push' && stream.pushEndpointUrl) {
      void this.push.deliver({
        deliveryId: delivery.id,
        url: stream.pushEndpointUrl,
        authHeader: stream.pushAuthHeader,
        setJwt: set.jwt,
      });
    }
  }
}
