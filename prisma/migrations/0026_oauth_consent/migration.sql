-- Remembered consent and first-party clients. Additive.
--
-- The consent screen was shown on every interactive sign-in, for every
-- application, and prompt=none handed out codes with no consent check at
-- all. oauth_consents records what a person approved per application, so
-- the screen appears once (and again only for new scopes); firstParty marks
-- the deployment's own applications, which need no consent. Toggled per
-- client in the admin; never true for a dcr_* (self-registered) client.
ALTER TABLE "oauth_clients"
  ADD COLUMN IF NOT EXISTS "firstParty" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "oauth_consents" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "clientId" TEXT NOT NULL,
  "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "oauth_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_consents_userId_clientId_key" ON "oauth_consents"("userId", "clientId");
CREATE INDEX IF NOT EXISTS "oauth_consents_clientId_idx" ON "oauth_consents"("clientId");

ALTER TABLE "oauth_consents"
  ADD CONSTRAINT "oauth_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauth_consents"
  ADD CONSTRAINT "oauth_consents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: a client an administrator registered is one of the deployment's
-- own apps (the admin now defaults new ones to first-party too); clients
-- that registered themselves (dcr_*) are third parties. Anything wrong here
-- is one click in the admin to correct.
UPDATE "oauth_clients" SET "firstParty" = true WHERE "clientId" NOT LIKE 'dcr\_%';
