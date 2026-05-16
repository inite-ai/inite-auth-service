-- Adds the optional `companyId` field on OAuthClient — the tenant
-- identifier that machine clients (client_credentials grant) embed in
-- the `sub` claim of their issued JWTs.
--
-- Why optional + nullable: every existing client today is a user-facing
-- OAuth flow (authorization_code) where `sub` is the user's DID, not
-- the company. Those clients keep working unchanged. Only machine
-- clients calling horizontal services (brain, inbox, …) need this
-- field — populated when the registration script provisions them.
--
-- For machine clients without companyId, the issuer falls back to
-- clientId as `sub` (per inite.service.brain's per-tenant database
-- model, this would create a fresh tenant — so the field SHOULD be
-- set explicitly whenever we want the JWT-armed client to land in an
-- existing tenant's data).

ALTER TABLE "oauth_clients"
  ADD COLUMN "companyId" TEXT;
