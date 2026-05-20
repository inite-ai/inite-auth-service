-- OIDC nonce persistence on authorization codes + refresh tokens
-- (carried across rotation per OIDC core §12.1).
ALTER TABLE "authorization_codes"
  ADD COLUMN IF NOT EXISTS "nonce" TEXT;

ALTER TABLE "refresh_tokens"
  ADD COLUMN IF NOT EXISTS "nonce" TEXT;

-- Grace-period rotation for OAuth client secrets. Both the current
-- and previous hash are honoured by validateClient until
-- previousSecretExpiresAt elapses.
ALTER TABLE "oauth_clients"
  ADD COLUMN IF NOT EXISTS "previousSecretHash" TEXT,
  ADD COLUMN IF NOT EXISTS "previousSecretExpiresAt" TIMESTAMP(3);
