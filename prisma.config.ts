import 'dotenv/config';
import { defineConfig } from 'prisma/config';

function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = process.env.DB_USER || 'postgres';
  const pass = process.env.DB_PASSWORD || '';
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const name = process.env.DB_NAME || 'inite_auth';
  return `postgresql://${user}:${pass}@${host}:${port}/${name}`;
}

export default defineConfig({
  earlyAccess: true,
  schema: 'prisma/schema.prisma',
  datasource: {
    url: buildDatabaseUrl(),
  },
});
