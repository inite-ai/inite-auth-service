-- Policy-delivery channels for agent credentials. Additive; no backfill.
--   api_keys.policyNames    — ABAC policy set names, surfaced as the
--                             `policy` member of the introspection answer.
--   oauth_clients.customClaims — sanitized vertical-facing claims
--                             (policy/packs) stamped on tokens issued
--                             to/for the client.
ALTER TABLE "api_keys"
  ADD COLUMN IF NOT EXISTS "policyNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "oauth_clients"
  ADD COLUMN IF NOT EXISTS "customClaims" JSONB;
