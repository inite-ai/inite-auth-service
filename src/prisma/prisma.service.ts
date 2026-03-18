import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { parse as parseArray } from 'postgres-array';

// Register array parsers for text[] and varchar[] that pg doesn't parse by default
pg.types.setTypeParser(1009 as any, (val: string) => parseArray(val));
pg.types.setTypeParser(1015 as any, (val: string) => parseArray(val));

function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = process.env.DB_USER || 'postgres';
  const pass = process.env.DB_PASSWORD || '';
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const name = process.env.DB_NAME || 'inite_auth';
  return `postgresql://${user}:${pass}@${host}:${port}/${name}`;
}

const pool = new pg.Pool({ connectionString: buildDatabaseUrl() });
const adapter = new PrismaPg(pool as any);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter } as any);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    pool.end();
    await this.$disconnect();
  }
}
