-- Denormalise companyId onto OAuth-issued artefacts so tenant-scoped
-- admin queries don't require a join (and survive client deletes).

ALTER TABLE "oauth_audit_log"
  ADD COLUMN IF NOT EXISTS "companyId" TEXT;

ALTER TABLE "authorization_codes"
  ADD COLUMN IF NOT EXISTS "companyId" TEXT;

ALTER TABLE "refresh_tokens"
  ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- Backfill from oauth_clients. Rows whose client was already deleted
-- stay NULL — that's "global / unknown tenant", which scoped reads
-- treat as cross-tenant and therefore filter out.
UPDATE "oauth_audit_log" l
   SET "companyId" = c."companyId"
  FROM "oauth_clients" c
 WHERE l."clientId" = c."clientId"
   AND l."companyId" IS NULL;

UPDATE "authorization_codes" a
   SET "companyId" = c."companyId"
  FROM "oauth_clients" c
 WHERE a."clientId" = c."clientId"
   AND a."companyId" IS NULL;

UPDATE "refresh_tokens" r
   SET "companyId" = c."companyId"
  FROM "oauth_clients" c
 WHERE r."clientId" = c."clientId"
   AND r."companyId" IS NULL;

CREATE INDEX IF NOT EXISTS "oauth_audit_log_companyId_ts_idx"
  ON "oauth_audit_log" ("companyId", "ts" DESC);

CREATE INDEX IF NOT EXISTS "refresh_tokens_companyId_revoked_idx"
  ON "refresh_tokens" ("companyId", "revoked");
