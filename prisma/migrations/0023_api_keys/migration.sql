-- Long-lived opaque API keys for vertical resource access ("ik_…").
-- Raw value stored only as SHA-256 (keyHash); verticals verify via
-- RFC 7662 introspection. Additive; no backfill.
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "keyHash"        TEXT NOT NULL,
  "prefix"         TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "userId"         UUID,
  "organizationId" UUID NOT NULL,
  "audience"       TEXT NOT NULL,
  "scopes"         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expiresAt"      TIMESTAMP(3),
  "revoked"        BOOLEAN NOT NULL DEFAULT false,
  "revokedAt"      TIMESTAMP(3),
  "lastUsedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_keyHash_key" ON "api_keys" ("keyHash");
CREATE INDEX IF NOT EXISTS "api_keys_organizationId_idx" ON "api_keys" ("organizationId");
CREATE INDEX IF NOT EXISTS "api_keys_userId_idx" ON "api_keys" ("userId");
