-- RFC 9396 Rich Authorization Requests: persist the validated
-- `authorization_details` JSON array on the authorization code and carry it
-- forward across refresh-token rotation. Additive + nullable — no backfill.
ALTER TABLE "authorization_codes" ADD COLUMN IF NOT EXISTS "authorizationDetails" JSONB;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "authorizationDetails" JSONB;
