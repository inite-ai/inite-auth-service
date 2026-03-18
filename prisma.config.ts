import path from 'node:path';
import { defineConfig } from 'prisma/config';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] });

const url =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'inite_auth'}`;

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrate: {
    url,
  },
});
