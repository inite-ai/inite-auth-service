-- Security hardening migration:
--   1. Refresh-token rewrite: add deterministic HMAC lookup column for O(1)
--      verified lookup (replaces bcrypt scan-all-rows). Drop unique on the
--      legacy bcrypt tokenHash and make it nullable so new rows don't write
--      it. Old rows still validate (legacy code path) until they expire,
--      then the cleanup cron removes them.
--   2. Strip plaintext DID private keys from existing user.metadata blobs.
--      The server never reads them; storage was a CRIT data-leak liability.

-- 1. RefreshToken schema changes
ALTER TABLE "refresh_tokens"
  ADD COLUMN "tokenLookup" TEXT;
ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_tokenLookup_key" UNIQUE ("tokenLookup");

ALTER TABLE "refresh_tokens"
  DROP CONSTRAINT IF EXISTS "refresh_tokens_tokenHash_key";
ALTER TABLE "refresh_tokens"
  ALTER COLUMN "tokenHash" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "refresh_tokens_userId_clientId_revoked_idx"
  ON "refresh_tokens" ("userId", "clientId", "revoked");

-- 2. Strip DID private keys from existing user metadata.
-- These were stored in plaintext and never read by the server.
UPDATE "users"
SET "metadata" = "metadata" - 'didPrivateKey'
WHERE "metadata" ? 'didPrivateKey';
