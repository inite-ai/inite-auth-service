import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Single-use guard for private_key_jwt client assertions (RFC 7523 §3, jti).
 * Recording (clientId, jti) with a unique constraint makes replay a
 * constraint violation — atomic, no read-then-write race.
 */
@Injectable()
export class ClientAssertionJtiStore {
  constructor(private readonly prisma: PrismaService) {}

  async consume(input: { clientId: string; jti: string; expiresAt: Date }): Promise<void> {
    try {
      await this.prisma.clientAssertionJti.create({ data: input });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new UnauthorizedException('client_assertion replayed (jti reuse)');
      }
      throw e;
    }
  }
}
