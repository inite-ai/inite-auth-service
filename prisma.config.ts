import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 CLI configuration. The datasource URL no longer lives in
 * schema.prisma (Rust-free client); the CLI (migrate / db push / studio)
 * reads it here, while the runtime connects via the driver adapter in
 * src/prisma/prisma.service.ts. `dotenv/config` loads DATABASE_URL from .env.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
