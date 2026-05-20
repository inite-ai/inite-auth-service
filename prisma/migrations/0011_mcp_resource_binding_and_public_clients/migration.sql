-- RFC 8707 resource indicators + RFC 7591 public clients (DCR).
--
-- New columns:
--   oauth_clients.allowedResources         — per-client allowlist for
--                                             RFC 8707 `resource` param.
--                                             Empty array = legacy
--                                             behaviour (aud=clientId).
--   oauth_clients.tokenEndpointAuthMethod  — "client_secret_post"
--                                             (default, confidential)
--                                             or "none" (public client
--                                             via DCR, PKCE-only).
--   authorization_codes.resource           — persisted indicator,
--                                             round-tripped into aud
--                                             at /token.
--   refresh_tokens.resource                — carried across rotation
--                                             so refresh-issued
--                                             access tokens keep
--                                             the same audience.
--
-- Schema relax:
--   oauth_clients.clientSecretHash         — now NULLABLE. Public
--                                             clients registered via
--                                             DCR don't carry a
--                                             secret. validateClient
--                                             reads the auth-method
--                                             column to know whether
--                                             to skip the bcrypt
--                                             check (timing-equalised
--                                             via the existing dummy
--                                             hash path).

ALTER TABLE "oauth_clients"
  ADD COLUMN IF NOT EXISTS "allowedResources" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'client_secret_post';

ALTER TABLE "oauth_clients"
  ALTER COLUMN "clientSecretHash" DROP NOT NULL;

ALTER TABLE "authorization_codes"
  ADD COLUMN IF NOT EXISTS "resource" TEXT;

ALTER TABLE "refresh_tokens"
  ADD COLUMN IF NOT EXISTS "resource" TEXT;
