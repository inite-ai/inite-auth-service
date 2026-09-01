-- Device metadata for user-visible sessions. Additive; no backfill.
--
-- The account page renders "Active sessions" from refresh_tokens, but the
-- row carried no way to tell two sessions of the same client apart — every
-- entry read as the client's name and nothing else. These three columns are
-- stamped from RequestContextMiddleware (AsyncLocalStorage) at issue time
-- and refreshed on rotation, so a user can recognise (and revoke) a specific
-- device instead of guessing.
--
-- All nullable: rows minted before this migration keep NULL and the UI
-- degrades to "Unknown device" for them rather than lying.
ALTER TABLE "refresh_tokens"
  ADD COLUMN IF NOT EXISTS "ip" TEXT,
  ADD COLUMN IF NOT EXISTS "userAgent" TEXT,
  ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);
