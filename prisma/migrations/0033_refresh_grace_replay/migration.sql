-- 0033_refresh_grace_replay — additive, nullable, no backfill.
--
-- Refresh reuse grace (issue #287, owner decision 04.11.2026). Within
-- REFRESH_REUSE_GRACE of a rotation, a replay of the rotated refresh token by
-- the same client gets the SAME pair the rotation returned (the reuse-interval
-- pattern), never a new token. To hand it back, the rotated (parent) row keeps
-- that pair for the window: graceReplay is a FieldCrypto v1 envelope
-- (AES-256-GCM under FIELD_ENCRYPTION_KEY), never plaintext; graceReplayUntil
-- is when it stops being returned and is erased (lazily on read, and by the
-- hourly cleanup). Existing rows have neither, which is true.
-- Adding nullable columns rewrites nothing.
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "graceReplay" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "graceReplayUntil" TIMESTAMP(3);
