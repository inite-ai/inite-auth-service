-- Adds an allowed-audiences list on OAuthClient.
--
-- M2M JWTs carry an `aud` claim that downstream services validate.
-- Without this allow-list, a stolen client_credentials pair could
-- request a token for ANY audience (brain, inbox, …) and pass each
-- service's audience-check. By constraining `aud` at issuance to a
-- per-client allow-list, a compromised client_id can only attack
-- the services its operator explicitly authorised.
--
-- Empty array (default) means "no constraint" — the issuer falls
-- back to `aud = client_id` (the conservative legacy behaviour
-- before this field landed). Set explicitly via the admin UI when
-- provisioning machine clients.

ALTER TABLE "oauth_clients"
  ADD COLUMN "allowedAudiences" TEXT[] DEFAULT ARRAY[]::TEXT[];
