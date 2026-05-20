-- OIDC Back-Channel Logout + Step-up auth (ACR/AMR) support.

ALTER TABLE "oauth_clients"
  ADD COLUMN IF NOT EXISTS "backchannelLogoutUri" TEXT;

ALTER TABLE "authorization_codes"
  ADD COLUMN IF NOT EXISTS "acrValues" TEXT,
  ADD COLUMN IF NOT EXISTS "amr" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "refresh_tokens"
  ADD COLUMN IF NOT EXISTS "amr" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
