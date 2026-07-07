-- RFC 7523 private_key_jwt client authentication + RFC 9101 signed request
-- objects. Additive: existing clients default to client_secret_post, so
-- behaviour is unchanged until a client registers with keys.
ALTER TABLE "oauth_clients"
  ADD COLUMN IF NOT EXISTS "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'client_secret_post';
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "jwks" JSONB;
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "jwksUri" TEXT;
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "requestObjectSigningAlg" TEXT;

-- Replay guard for client assertions (single-use jti per client).
CREATE TABLE IF NOT EXISTS "client_assertion_jti" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "clientId"  TEXT NOT NULL,
  "jti"       TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_assertion_jti_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "client_assertion_jti_clientId_jti_key"
  ON "client_assertion_jti" ("clientId", "jti");
CREATE INDEX IF NOT EXISTS "client_assertion_jti_expiresAt_idx"
  ON "client_assertion_jti" ("expiresAt");
