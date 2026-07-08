-- DB-backed federation provider config (Google / GitHub / generic OIDC).
-- Additive: one new table, no changes to existing rows. Env config stays the
-- fallback when no row exists; the client secret is stored FieldCrypto-encrypted.

CREATE TABLE IF NOT EXISTS "federation_providers" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug"            TEXT NOT NULL,
  "displayName"     TEXT NOT NULL,
  "enabled"         BOOLEAN NOT NULL DEFAULT false,
  "clientId"        TEXT NOT NULL,
  "clientSecretEnc" TEXT,
  "scopes"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "issuer"          TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "federation_providers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "federation_providers_slug_key" ON "federation_providers" ("slug");
