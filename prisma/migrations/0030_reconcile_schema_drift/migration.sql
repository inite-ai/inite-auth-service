-- 0030_reconcile_schema_drift — make the migrated database match
-- prisma/schema.prisma exactly.
--
-- The hand-written migrations 0001…0029 left a few differences against the
-- schema the Prisma client is generated from. They surfaced once 0000_baseline
-- made it possible to build a database from migrations alone and diff it
-- (`prisma migrate diff --from-config-datasource --to-schema`). Every install
-- that replayed those migrations — production included — carries the same
-- differences, so the fix ships as a migration rather than as a baseline edit.
--
-- None of this rewrites a table or touches a row:
--   * six foreign keys were created without ON UPDATE CASCADE (Prisma's
--     default); they are recreated with it.
--   * 0002 dropped the legacy unique on refresh_tokens.tokenHash with
--     DROP CONSTRAINT, but `db push` had created it as a unique INDEX, so the
--     index outlived it. The schema no longer declares it.
--   * eleven tables carry a database-side gen_random_uuid() id default and
--     four a database-side updatedAt default the schema does not declare.
--     The Prisma client always supplies both values, so the defaults are
--     never used; they are dropped.
--   * the other direction, for installs built with `prisma db push` rather
--     than migrations: api_keys.scopes/policyNames get the empty-array
--     default 0023/0024 gave them (now declared in the schema), and
--     oauth_audit_log.ts is the plain `timestamp` 0005 created (declared as
--     @db.Timestamp(6)). On a migrated database both statements are no-ops;
--     on a pushed one, timestamp(3) -> timestamp(6) widens without a rewrite.
--
-- Every statement is idempotent, so the file is safe on any install: one
-- built from migrations, one adopted from `prisma db push`, or a fresh one.

-- Legacy tokenHash unique index (refresh-token rewrite, 0002).
DROP INDEX IF EXISTS "refresh_tokens_tokenHash_key";

-- Foreign keys: recreate with ON UPDATE CASCADE.
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_userId_fkey";
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_organizationId_fkey";
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_userId_fkey";
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_organizationId_fkey";
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_roles" DROP CONSTRAINT IF EXISTS "org_roles_organizationId_fkey";
ALTER TABLE "org_roles" ADD CONSTRAINT "org_roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "set_deliveries" DROP CONSTRAINT IF EXISTS "set_deliveries_streamId_fkey";
ALTER TABLE "set_deliveries" ADD CONSTRAINT "set_deliveries_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "ssf_streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Database-side defaults the schema does not declare.
ALTER TABLE "api_keys" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "client_assertion_jti" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "device_authorizations" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "federation_providers" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "memberships" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "oauth_audit_log" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "org_roles" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "organizations" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "saml_connections" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "set_deliveries" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "ssf_streams" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Shape a `prisma db push` install lacks (no-ops on a migrated database).
ALTER TABLE "api_keys" ALTER COLUMN "scopes" SET DEFAULT ARRAY[]::TEXT[], ALTER COLUMN "policyNames" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "oauth_audit_log" ALTER COLUMN "ts" SET DATA TYPE TIMESTAMP(6);
