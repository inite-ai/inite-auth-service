-- 0033_refresh_token_family — additive, nullable / default false, no backfill.
--
-- Refresh reuse grace (issue #287, src/oauth/refresh-grace.ts). Grace
-- siblings are capped per rotation family, not per presented token, and a
-- sibling (or a token rotated from one) may never mint siblings itself:
-- otherwise one stolen token fans out into unlimited live sessions.
--
-- familyId: the id of the family's first token, carried across rotation;
-- NULL means "this row is its family's first token" (and every row minted
-- before this migration reads that way, so a legacy family starts at its
-- next child). graceMinted marks a sibling; graceLineage marks a sibling and
-- every token rotated from it. Existing rows are neither, which is true.
-- Adding columns with a constant default rewrites nothing (Postgres 11+).
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "familyId" UUID;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "graceLineage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "graceMinted" BOOLEAN NOT NULL DEFAULT false;

-- The per-family sibling count.
CREATE INDEX IF NOT EXISTS "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");
