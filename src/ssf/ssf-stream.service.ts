import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { SsfStream } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminScope, applyScopeFilter } from '../admin/admin-scope';
import { ALL_CAEP_EVENTS } from './caep-event-types';
import { CreateStreamDto } from './dto/create-stream.dto';

/** CRUD for SSF streams, tenant-scoped to the admin operator. */
@Injectable()
export class SsfStreamService {
  constructor(private readonly prisma: PrismaService) {}

  async create(scope: AdminScope, dto: CreateStreamDto): Promise<SsfStream> {
    const companyId = scope.kind === 'scoped' ? scope.companyId : dto.companyId ?? null;
    return this.prisma.ssfStream.create({
      data: {
        streamId: crypto.randomUUID(),
        companyId,
        deliveryMethod: dto.delivery_method,
        pushEndpointUrl: dto.push_endpoint_url ?? null,
        pushAuthHeader: dto.push_auth_header ?? null,
        eventsRequested: dto.events_requested?.length ? dto.events_requested : ALL_CAEP_EVENTS,
        aud: dto.aud ?? [],
      },
    });
  }

  async list(scope: AdminScope): Promise<SsfStream[]> {
    const where: Record<string, unknown> = {};
    applyScopeFilter(scope, where);
    return this.prisma.ssfStream.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async get(scope: AdminScope, streamId: string): Promise<SsfStream> {
    const where: Record<string, unknown> = { streamId };
    applyScopeFilter(scope, where);
    const stream = await this.prisma.ssfStream.findFirst({ where });
    if (!stream) throw new NotFoundException('stream not found');
    return stream;
  }

  async remove(scope: AdminScope, streamId: string): Promise<void> {
    const stream = await this.get(scope, streamId);
    await this.prisma.ssfStream.delete({ where: { id: stream.id } });
  }

  /** Pause / resume delivery without deleting the stream. The emitter only
   *  fans events out to `status: 'enabled'` streams, so a disabled stream
   *  keeps its config + backlog but receives nothing new. */
  async setStatus(
    scope: AdminScope,
    streamId: string,
    status: 'enabled' | 'disabled',
  ): Promise<SsfStream> {
    const stream = await this.get(scope, streamId);
    return this.prisma.ssfStream.update({
      where: { id: stream.id },
      data: { status },
    });
  }
}
