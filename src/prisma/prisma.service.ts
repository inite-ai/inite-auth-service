import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Build DATABASE_URL from individual DB_* env vars if not already set
if (!process.env.DATABASE_URL) {
  const user = process.env.DB_USER || 'postgres';
  const pass = process.env.DB_PASSWORD || '';
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const name = process.env.DB_NAME || 'inite_auth';
  process.env.DATABASE_URL = `postgresql://${user}:${pass}@${host}:${port}/${name}`;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
