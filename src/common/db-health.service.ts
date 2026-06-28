import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Thin wrapper around the DB connection for liveness/readiness checks.
 *
 * Exists so controllers (e.g. HealthController) can probe the database
 * without importing the persistence layer directly — keeping the
 * controller → src/prisma layer boundary clean (see eslint
 * import/no-restricted-paths).
 */
@Injectable()
export class DbHealthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Throws if the database is unreachable. */
  async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
